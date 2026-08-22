import { describe, it, expect } from "vitest";
import { parseJudgeResult } from "./judge";

const good = {
  discovery:     { score: 5, rationale: "full picture", evidence: "what do you use now" },
  listening:     { score: 4, rationale: "reflected the pain", evidence: "starting over each time" },
  empathy:       { score: 3, rationale: "ok", evidence: "that sounds rough" },
  qualification: { score: 4, rationale: "read the fit", evidence: "are you the one who'd pick a tool" },
  guardrails:    { score: 4, rationale: "restrained", evidence: "" },
  handoff:       { score: 3, rationale: "set a follow-up", evidence: "let's have someone reach out" },
  summary:       "Solid discovery.",
};

describe("parseJudgeResult", () => {
  it("parses a well-formed object", () => {
    const r = parseJudgeResult(JSON.stringify(good));
    expect(r.listening.score).toBe(4);
    expect(r.discovery.evidence).toBe("what do you use now");
    expect(r.qualification.score).toBe(4);
    expect(r.handoff.rationale).toBe("set a follow-up");
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
    const { qualification, ...rest } = good;
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
  discovery:     { score: 3, rationale: "", evidence: "x" },
  listening:     { score: 3, rationale: "", evidence: "x" },
  empathy:       { score: 3, rationale: "", evidence: "x" },
  qualification: { score: 3, rationale: "", evidence: "x" },
  guardrails:    { score: 3, rationale: "", evidence: "x" },
  handoff:       { score: 3, rationale: "", evidence: "x" },
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

  it("normalizes the six 0-20 values over 120", () => {
    // all 3s -> 12 each -> 72 -> 72/120*100 = 60
    const { score } = judgeResultToScore(base() as never, null);
    expect(score).toBe(60);
  });

  it("populates evidence from each of the six dimensions in order", () => {
    const { evidence } = judgeResultToScore(base() as never, null);
    expect(evidence).toHaveLength(6);
    expect(evidence[0].dimension).toBe("discovery");
    expect(evidence[3].dimension).toBe("qualification");
    expect(evidence[5].dimension).toBe("handoff");
  });
});

describe("deriveGrade — no outcome nudge, no floor", () => {
  it("gives a high-quality polite exit a better grade than a low-quality forced MQL", () => {
    // Correct disqualification: strong discovery/listening and a clean-exit handoff.
    const goodExit = judgeResultToScore(
      base({
        discovery: { score: 5, rationale: "", evidence: "x" },
        listening: { score: 5, rationale: "", evidence: "x" },
        empathy: { score: 4, rationale: "", evidence: "x" },
        qualification: { score: 5, rationale: "", evidence: "x" },
        handoff: { score: 5, rationale: "", evidence: "x" },
      }) as never,
      "POLITE_EXIT"
    );
    // Forced MQL with no real conversation behind it.
    const badMql = judgeResultToScore(
      base({
        discovery: { score: 1, rationale: "", evidence: "" },
        listening: { score: 1, rationale: "", evidence: "" },
        qualification: { score: 1, rationale: "", evidence: "" },
        handoff: { score: 1, rationale: "", evidence: "" },
      }) as never,
      "BADGE_SCAN"
    );
    expect(goodExit.score).toBeGreaterThan(badMql.score);
    expect(deriveGrade(goodExit.score)).not.toBe("F");
    expect(deriveGrade(badMql.score)).toBe("F");
  });

  it("ignores the detected outcome entirely — score depends only on the six dimensions", () => {
    const asMql = judgeResultToScore(base() as never, "BADGE_SCAN").score;
    const asExit = judgeResultToScore(base() as never, "POLITE_EXIT").score;
    const asNone = judgeResultToScore(base() as never, null).score;
    expect(asMql).toBe(60);
    expect(asExit).toBe(60);
    expect(asNone).toBe(60);
  });
});
