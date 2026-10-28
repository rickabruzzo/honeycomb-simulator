import { beforeEach, describe, expect, it } from "vitest";
import { getMemStore } from "../memoryStore";
import { upsertTrainee } from "../traineeStore";
import { partialPos } from "./logic";
import { answerQuestion, getOrCreateQuizLink, startAttempt } from "./store";
import type { QuizAttempt, QuizBank, QuizQuestion } from "./types";

// Memory mode (no KV env in vitest).
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
