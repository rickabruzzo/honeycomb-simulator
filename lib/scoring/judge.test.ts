import { describe, it, expect } from "vitest";
import { parseJudgeResult } from "./judge";

const good = {
  listening:        { score: 4, rationale: "reflected the pain", evidence: "starting over each time" },
  discovery:        { score: 5, rationale: "full picture", evidence: "what do you use now" },
  empathy:          { score: 3, rationale: "ok", evidence: "that sounds rough" },
  otel_assumptions: { score: 2, rationale: "assumed", evidence: "since you're on otel" },
  guardrails:       { score: 4, rationale: "restrained", evidence: "" },
  summary:          "Solid discovery.",
};

describe("parseJudgeResult", () => {
  it("parses a well-formed object", () => {
    const r = parseJudgeResult(JSON.stringify(good));
    expect(r.listening.score).toBe(4);
    expect(r.discovery.evidence).toBe("what do you use now");
    expect(r.summary).toBe("Solid discovery.");
  });

  it("strips markdown code fences before parsing", () => {
    const fenced = "```json\n" + JSON.stringify(good) + "\n```";
    expect(parseJudgeResult(fenced).listening.score).toBe(4);
  });

  it("throws on unparseable text", () => {
    expect(() => parseJudgeResult("not json at all")).toThrow();
  });

  it("throws when a dimension is missing", () => {
    const { discovery, ...rest } = good;
    expect(() => parseJudgeResult(JSON.stringify(rest))).toThrow();
  });

  it("throws when a score is out of range", () => {
    const bad = { ...good, listening: { ...good.listening, score: 9 } };
    expect(() => parseJudgeResult(JSON.stringify(bad))).toThrow();
  });

  it("throws when a score is not an integer", () => {
    const bad = { ...good, empathy: { ...good.empathy, score: 2.5 } };
    expect(() => parseJudgeResult(JSON.stringify(bad))).toThrow();
  });

  it("defaults missing evidence/rationale to empty strings", () => {
    const noEv = { ...good, guardrails: { score: 3 } };
    const r = parseJudgeResult(JSON.stringify(noEv));
    expect(r.guardrails.evidence).toBe("");
    expect(r.guardrails.rationale).toBe("");
  });
});

import { judgeResultToScore, deriveGrade } from "./judge-mapping";

const base = (over: Record<string, { score: number; rationale?: string; evidence?: string }> = {}) => ({
  listening:        { score: 3, rationale: "", evidence: "x" },
  discovery:        { score: 3, rationale: "", evidence: "x" },
  empathy:          { score: 3, rationale: "", evidence: "x" },
  otel_assumptions: { score: 3, rationale: "", evidence: "x" },
  guardrails:       { score: 3, rationale: "", evidence: "x" },
  summary: "",
  ...over,
});

describe("judgeResultToScore", () => {
  it("maps 0-5 to 0-20 per dimension", () => {
    const { breakdown } = judgeResultToScore(
      base({ listening: { score: 4, rationale: "", evidence: "x" } }) as never,
      null
    );
    expect(breakdown.listening).toBe(16); // 4/5*20
    expect(breakdown.discovery).toBe(12); // 3/5*20
  });

  it("populates evidence from each dimension", () => {
    const { evidence } = judgeResultToScore(base() as never, null);
    expect(evidence).toHaveLength(5);
    expect(evidence[0].dimension).toBe("listening");
  });
});

describe("deriveGrade — no outcome floor", () => {
  it("gives a high-quality polite exit a better grade than a low-quality MQL", () => {
    const goodExit = judgeResultToScore(
      base({
        listening: { score: 5, rationale: "", evidence: "x" },
        discovery: { score: 5, rationale: "", evidence: "x" },
        empathy: { score: 4, rationale: "", evidence: "x" },
      }) as never,
      "POLITE_EXIT"
    );
    const badMql = judgeResultToScore(
      base({
        listening: { score: 1, rationale: "", evidence: "" },
        discovery: { score: 1, rationale: "", evidence: "" },
      }) as never,
      "BADGE_SCAN"
    );
    expect(goodExit.score).toBeGreaterThan(badMql.score);
    expect(deriveGrade(goodExit.score)).not.toBe("F");
  });

  it("withholds the outcome nudge when discovery or listening scored below 3", () => {
    const withNudge = judgeResultToScore(base() as never, "BADGE_SCAN").score; // both == 3 -> 60+5
    const noNudge = judgeResultToScore(
      base({ discovery: { score: 2, rationale: "", evidence: "" } }) as never,
      "BADGE_SCAN"
    ).score;
    expect(withNudge).toBe(65);
    expect(noNudge).toBeLessThan(withNudge);
  });
});
