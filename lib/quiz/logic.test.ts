import { describe, expect, it } from "vitest";
import { buildItems, computeResult, correctPos, drawQuestions, gradeFor, toClientQuestion } from "./logic";
import type { QuizAttempt, QuizBank, QuizQuestion } from "./types";

function q(id: string, module: string): QuizQuestion {
  return {
    id,
    module,
    moduleTitle: module.toUpperCase(),
    attendee: `line ${id}`,
    prompt: "What's the best response?",
    choices: [
      { text: "a", why_not: "no a" },
      { text: "b", correct: true },
      { text: "c", why_not: "no c" },
      { text: "d", why_not: "no d" },
    ],
    why_best: "b is best",
  };
}

const MODULES = ["m1", "m2", "m3", "m4", "m5", "m6"];
const POOL = MODULES.flatMap((m) => Array.from({ length: 12 }, (_, i) => q(`${m}-${i}`, m)));

describe("gradeFor", () => {
  it("uses the scorecard scale, where 10/15 is a C and 9/15 is not", () => {
    expect(gradeFor(90)).toBe("A");
    expect(gradeFor(78)).toBe("B");
    expect(gradeFor((10 / 15) * 100)).toBe("C");
    expect(gradeFor((9 / 15) * 100)).toBe("D");
    expect(gradeFor(10)).toBe("F");
  });
});

describe("drawQuestions", () => {
  it("draws 15 distinct questions spread 3/3/3/2/2/2 across six modules", () => {
    const drawn = drawQuestions(POOL, 15);
    expect(drawn).toHaveLength(15);
    expect(new Set(drawn.map((d) => d.id)).size).toBe(15);
    const counts = MODULES.map((m) => drawn.filter((d) => d.module === m).length).sort();
    expect(counts).toEqual([2, 2, 2, 3, 3, 3]);
  });

  it("prefers questions the trainee didn't see last attempt", () => {
    const first = drawQuestions(POOL, 15);
    const second = drawQuestions(POOL, 15, new Set(first.map((d) => d.id)));
    const overlap = second.filter((d) => first.some((f) => f.id === d.id));
    expect(overlap).toHaveLength(0);
  });

  it("still fills the attempt when a module runs short", () => {
    const lopsided = [...POOL.filter((p) => p.module === "m1"), q("m2-0", "m2"), q("m3-0", "m3")];
    expect(drawQuestions(lopsided, 10)).toHaveLength(10);
  });
});

describe("client view and scoring", () => {
  it("never sends correctness or explanations, and maps display order back correctly", () => {
    const [question] = POOL;
    const [item] = buildItems([question]);
    const view = toClientQuestion(question, item, 0);
    expect(JSON.stringify(view)).not.toMatch(/correct|why_not|why_best|b is best/);
    expect(view.choices[correctPos(question, item)]).toBe("b");
  });

  it("computes the result and pass flag from first-try answers", () => {
    const drawn = POOL.slice(0, 15);
    const items = buildItems(drawn).map((it, i) => ({ ...it, answeredPos: 0, correct: i < 10 }));
    const bank = {
      version: "t",
      gateVersion: 1,
      questionsPerAttempt: 15,
      passPercent: 65,
      questions: POOL,
      sources: [],
      leaders: [{ id: "x", name: "X", title: "CEO", portrait: "x.png" }],
      gradeLines: { A: "a", B: "b", C: "c", D: "d", F: "f" },
    } satisfies QuizBank;
    const attempt: QuizAttempt = {
      id: "1",
      token: "t",
      traineeKey: "invite:t",
      bankVersion: "t",
      gateVersion: 1,
      leaderId: "x",
      items,
      createdAt: "",
    };
    const result = computeResult(attempt, bank);
    expect(result).toMatchObject({ right: 10, total: 15, grade: "C", passed: true });
    expect(result.leader).toMatchObject({ name: "X", line: "c" });
    expect(result.missed).toHaveLength(5);
  });
});
