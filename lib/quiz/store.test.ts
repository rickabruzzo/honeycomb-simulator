import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/kv", async () => ({ kv: (await import("../testing/fakeKv")).fakeKv }));

import { getMemStore } from "../memoryStore";
import { enableFakeKvEnv, fakeKv } from "../testing/fakeKv";
import { upsertTrainee } from "../traineeStore";
import { correctPos, partialPos } from "./logic";
import {
  answerQuestion,
  deleteQuizTrainee,
  getOrCreateQuizLink,
  listQuizRecords,
  startAttempt,
} from "./store";
import type { QuizAttempt, QuizBank, QuizQuestion } from "./types";

// Memory mode (no KV env in vitest), except where a describe block switches on the fake KV client.
beforeEach(() => {
  const mem = getMemStore();
  mem.trainees.clear();
  mem.traineeIndex.length = 0;
  mem.quiz.clear();
});

const question: QuizQuestion = {
  id: "p-1",
  module: "m1",
  moduleTitle: "Module one",
  attendee: "I'd rather poke at it on my own.",
  prompt: "What's the best next step?",
  choices: [
    { text: "demo first", partial: true, why_not: "Fine, but they told you how they like to explore." },
    { text: "postcard", correct: true },
    { text: "badge scan", why_not: "No team or budget signal." },
    { text: "swag", why_not: "Leaves the interest nowhere to go." },
  ],
  why_best: "They want to explore alone.",
};

const bank: QuizBank = {
  version: "t",
  gateVersion: 1,
  questionsPerAttempt: 1,
  passPercent: 65,
  questions: [question],
  sources: [],
  leaders: [],
  gradeLines: { A: "a", B: "b", C: "c", D: "d", F: "f" },
};

describe("answerQuestion with a partial-credit choice", () => {
  it("returns an 'okay' verdict worth half a point and records it on the attempt", async () => {
    const trainee = await upsertTrainee({ firstName: "Quiz", lastName: "Tester" });
    const link = (await getOrCreateQuizLink(trainee.id))!;
    const { attemptId } = await startAttempt(link, bank);
    const attempt = getMemStore().quiz.get(`quiz_attempt:${attemptId}`) as QuizAttempt;
    const pos = partialPos(question, attempt.items[0]);
    expect(pos).toBeGreaterThanOrEqual(0);

    const out = await answerQuestion(link, attemptId, 0, pos, bank);
    expect(out).toMatchObject({
      correct: false,
      partial: true,
      pos, // the server says which choice counted, so a retried request can't repaint another one
      whyNot: "Fine, but they told you how they like to explore.",
      whyBest: "They want to explore alone.",
    });
    if ("error" in out) throw new Error(out.error);
    expect(out.result).toMatchObject({ right: 0, partial: 1, points: 0.5, total: 1, percent: 50, passed: false });
    expect(out.result?.okay).toHaveLength(1);

    // The record keeps the partial count and modules for the Quiz Results tab.
    const record = getMemStore().quiz.get(`quiz_results:trainee:${trainee.id}`) as {
      attempts: Array<{ partial?: number; right: number; okayModules?: string[] }>;
    };
    expect(record.attempts[0]).toMatchObject({ right: 0, partial: 1, okayModules: ["Module one"] });

    // Re-answering returns the original verdict; the score is first try only.
    const again = await answerQuestion(link, attemptId, 0, (pos + 1) % 4, bank);
    expect(again).toMatchObject({ correct: false, partial: true, pos });
  });

  it("credits whichever partial choice was picked, even if the bank wrongly flags two", async () => {
    const twoPartials: QuizQuestion = {
      ...question,
      choices: question.choices.map((c) => (c.text === "badge scan" ? { ...c, partial: true } : c)),
    };
    const loose: QuizBank = { ...bank, questions: [twoPartials] };
    for (const text of ["demo first", "badge scan"]) {
      const trainee = await upsertTrainee({ firstName: "Quiz", lastName: `Tester ${text}` });
      const link = (await getOrCreateQuizLink(trainee.id))!;
      const { attemptId } = await startAttempt(link, loose);
      const attempt = getMemStore().quiz.get(`quiz_attempt:${attemptId}`) as QuizAttempt;
      const pos = attempt.items[0].order.findIndex((ci) => twoPartials.choices[ci].text === text);
      const out = await answerQuestion(link, attemptId, 0, pos, loose);
      expect(out).toMatchObject({ correct: false, partial: true });
    }
  });

  it("marks a plain wrong answer as not partial", async () => {
    const trainee = await upsertTrainee({ firstName: "Quiz", lastName: "Tester" });
    const link = (await getOrCreateQuizLink(trainee.id))!;
    const { attemptId } = await startAttempt(link, bank);
    const attempt = getMemStore().quiz.get(`quiz_attempt:${attemptId}`) as QuizAttempt;
    const wrong = attempt.items[0].order.findIndex((ci) => question.choices[ci].text === "swag");
    const out = await answerQuestion(link, attemptId, 0, wrong, bank);
    expect(out).toMatchObject({ correct: false, partial: false, whyNot: "Leaves the interest nowhere to go." });
  });
});

describe("quiz results index, KV mode", () => {
  const T0 = new Date("2026-10-28T12:00:00.000Z").getTime();
  beforeEach(() => {
    fakeKv.reset();
    enableFakeKvEnv();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("indexes a trainee once, in one atomic ZADD NX + trim, when their quiz link is created", async () => {
    const t = await upsertTrainee({ firstName: "Quiz", lastName: "Tester" });
    fakeKv.calls = [];

    const link = await getOrCreateQuizLink(t.id);
    expect(link?.traineeId).toBe(t.id);

    const multis = fakeKv.calls.filter((c) => c.op === "multi");
    expect(multis).toHaveLength(1);
    expect(multis[0]).toEqual({
      op: "multi",
      commands: [
        { op: "zadd", args: ["quiz_results:index:v2", { nx: true }, { score: T0, member: t.id }] },
        { op: "zremrangebyrank", args: ["quiz_results:index:v2", 0, -1001] },
      ],
    });
    expect(fakeKv.commandsOf("set").map((c) => c.args[0])).not.toContain("quiz_results:index");
    expect((await listQuizRecords(null)).map((r) => r.traineeId)).toEqual([t.id]);
  });

  it("lists the newest trainee first; a later completion keeps an indexed trainee's place", async () => {
    const a = await upsertTrainee({ firstName: "Quiz", lastName: "Alpha" });
    const linkA = (await getOrCreateQuizLink(a.id))!;
    vi.setSystemTime(T0 + 1000);
    const b = await upsertTrainee({ firstName: "Quiz", lastName: "Beta" });
    await getOrCreateQuizLink(b.id);
    expect((await listQuizRecords(null)).map((r) => r.traineeId)).toEqual([b.id, a.id]);

    vi.setSystemTime(T0 + 2000);
    const { attemptId } = await startAttempt(linkA, bank);
    const attempt = (await fakeKv.get<QuizAttempt>(`quiz_attempt:${attemptId}`))!;
    const out = await answerQuestion(linkA, attemptId, 0, correctPos(question, attempt.items[0]), bank);
    expect(out).toMatchObject({ correct: true });
    if ("error" in out) throw new Error(out.error);
    expect(out.result?.passed).toBe(true);

    const records = await listQuizRecords(bank);
    expect(records.map((r) => r.traineeId)).toEqual([b.id, a.id]);
    expect(records.map((r) => r.passed)).toEqual([false, true]);
  });

  it("deleteQuizTrainee removes the index entry with one ZREM and reports whether anything existed", async () => {
    const t = await upsertTrainee({ firstName: "Quiz", lastName: "Tester" });
    await getOrCreateQuizLink(t.id);
    fakeKv.calls = [];

    expect(await deleteQuizTrainee(t.id)).toBe(true);
    expect(fakeKv.commandsOf("zrem")).toEqual([{ op: "zrem", args: ["quiz_results:index:v2", t.id] }]);
    expect(fakeKv.commandsOf("set")).toEqual([]);
    expect(await listQuizRecords(null)).toEqual([]);
    expect(await deleteQuizTrainee(t.id)).toBe(false);
  });

  it("migrates the legacy quiz_results:index array on first read, keeping its order", async () => {
    const record = (traineeId: string) => ({ traineeId, traineeName: traineeId, quizToken: "x", attempts: [] });
    await fakeKv.set("quiz_results:trainee:old-b", record("old-b"));
    await fakeKv.set("quiz_results:trainee:old-a", record("old-a"));
    await fakeKv.set("quiz_results:index", ["old-b", "old-a"]); // newest first, as the old code wrote it

    expect((await listQuizRecords(null)).map((r) => r.traineeId)).toEqual(["old-b", "old-a"]);
    expect(await fakeKv.get("quiz_results:index")).toBeNull();

    const t = await upsertTrainee({ firstName: "New", lastName: "Person" });
    await getOrCreateQuizLink(t.id);
    expect((await listQuizRecords(null)).map((r) => r.traineeId)).toEqual([t.id, "old-b", "old-a"]);
    expect(await deleteQuizTrainee("old-a")).toBe(true);
    expect((await listQuizRecords(null)).map((r) => r.traineeId)).toEqual([t.id, "old-b"]);
  });
});
