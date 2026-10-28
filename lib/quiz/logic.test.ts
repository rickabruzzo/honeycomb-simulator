import { describe, expect, it } from "vitest";
import { buildItems, computeResult, correctPos, drawQuestions, gradeFor, partialPos, toClientQuestion } from "./logic";
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
    // Records from before partial credit have no `partial` on items.
    expect(result).toMatchObject({ partial: 0, points: 10, okay: [] });
  });
});

describe("partial credit", () => {
  const withPartial: QuizQuestion = {
    ...q("p-0", "m1"),
    choices: [
      { text: "a", why_not: "no a" },
      { text: "b", correct: true },
      { text: "c", partial: true, why_not: "okay, but b is better" },
      { text: "d", why_not: "no d" },
    ],
  };
  const bank = {
    version: "t",
    gateVersion: 1,
    questionsPerAttempt: 15,
    passPercent: 65,
    questions: [withPartial, ...POOL],
    sources: [],
    leaders: [],
    gradeLines: { A: "a", B: "b", C: "c", D: "d", F: "f" },
  } satisfies QuizBank;

  it("maps the partial choice through the display order, or -1 when there is none", () => {
    const [item] = buildItems([withPartial]);
    expect(toClientQuestion(withPartial, item, 0).choices[partialPos(withPartial, item)]).toBe("c");
    expect(partialPos(POOL[0], buildItems([POOL[0]])[0])).toBe(-1);
  });

  it("counts a partial answer as half a point, so 9 right + 2 partial passes like 10 right", () => {
    const drawn = [withPartial, withPartial, ...POOL.slice(0, 13)];
    const items = buildItems(drawn).map((it, i) => ({
      ...it,
      answeredPos: 0,
      correct: i >= 2 && i < 11, // 9 right
      partial: i < 2, // 2 partial (the two withPartial copies)
    }));
    const attempt: QuizAttempt = {
      id: "1", token: "t", traineeKey: "trainee:x", bankVersion: "t", gateVersion: 1, leaderId: "", items, createdAt: "",
    };
    const result = computeResult(attempt, bank);
    expect(result).toMatchObject({ right: 9, partial: 2, points: 10, total: 15, percent: 66.7, grade: "C", passed: true });
    expect(result.missed).toHaveLength(4);
    expect(result.okay).toHaveLength(2);
    expect(result.okay[0].moduleTitle).toBe("M1");
  });
});
