import { describe, it, expect } from "vitest";
import { getLengthBudget, renderLengthDirective, budgetToPostProcessOptions } from "./lengthBudget";

describe("getLengthBudget", () => {
  it("keeps the icebreaker short", () => {
    expect(getLengthBudget("ICEBREAKER")).toEqual({ minSentences: 1, maxSentences: 2 });
  });
  it("gives pain discovery room to vent", () => {
    expect(getLengthBudget("PAIN_DISCOVERY")).toEqual({ minSentences: 2, maxSentences: 6 });
  });
  it("allows a considered reply in solution framing", () => {
    expect(getLengthBudget("SOLUTION_FRAMING")).toEqual({ minSentences: 2, maxSentences: 4 });
  });
  it("falls back to a middle budget for an unknown phase", () => {
    expect(getLengthBudget("NOT_A_PHASE")).toEqual({ minSentences: 2, maxSentences: 3 });
  });
});

describe("renderLengthDirective", () => {
  it("states the range and forbids padding", () => {
    const out = renderLengthDirective({ minSentences: 2, maxSentences: 6 });
    expect(out).toContain("2");
    expect(out).toContain("6");
    expect(out.toLowerCase()).toContain("no padding");
  });
});

describe("budgetToPostProcessOptions", () => {
  it("converts sentences into a matching character allowance", () => {
    expect(budgetToPostProcessOptions({ minSentences: 2, maxSentences: 6 })).toEqual({
      maxSentences: 6,
      maxChars: 1200,
    });
  });
  it("never allows less than the legacy template allowance", () => {
    const opts = budgetToPostProcessOptions({ minSentences: 1, maxSentences: 1 });
    expect(opts.maxChars).toBeGreaterThanOrEqual(220);
  });
});
