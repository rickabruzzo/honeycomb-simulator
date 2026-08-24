import { describe, it, expect } from "vitest";
import { parseJudgeResult } from "./judge";

const dim = (
  score: number,
  attendeeLine = "",
  traineeLine = "",
  coaching = ""
) => ({ score, attendeeLine, traineeLine, coaching });

const good = {
  discovery:     dim(5, "we use three tools now", "what do you use now", "full picture"),
  listening:     dim(4, "it feels like starting over", "starting over each time", "reflected the pain"),
  empathy:       dim(3, "it's been rough", "that sounds rough", "ok"),
  qualification: dim(4, "I'd be the one picking", "are you the one who'd pick a tool", "read the fit"),
  guardrails:    dim(4, "", "", "restrained"),
  handoff:       dim(3, "sure, reach out", "let's have someone reach out", "set a follow-up"),
  summary:       "Solid discovery.",
};

describe("parseJudgeResult", () => {
  it("parses a well-formed object", () => {
    const r = parseJudgeResult(JSON.stringify(good));
    expect(r.listening.score).toBe(4);
    expect(r.discovery.traineeLine).toBe("what do you use now");
    expect(r.discovery.attendeeLine).toBe("we use three tools now");
    expect(r.qualification.score).toBe(4);
    expect(r.handoff.coaching).toBe("set a follow-up");
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
    const bad = { ...good, listening: { ...good.listening, score: 11 } };
    expect(() => parseJudgeResult(JSON.stringify(bad))).toThrow();
  });

  it("throws when a score is not an integer", () => {
    const bad = { ...good, empathy: { ...good.empathy, score: 2.5 } };
    expect(() => parseJudgeResult(JSON.stringify(bad))).toThrow();
  });

  it("defaults missing coaching fields to empty strings", () => {
    const noEv = { ...good, guardrails: { score: 3 } };
    const r = parseJudgeResult(JSON.stringify(noEv));
    expect(r.guardrails.attendeeLine).toBe("");
    expect(r.guardrails.traineeLine).toBe("");
    expect(r.guardrails.coaching).toBe("");
  });

  it("falls back to the older rationale/evidence keys when present", () => {
    const oldShape = {
      ...good,
      guardrails: { score: 4, rationale: "restrained", evidence: "we stayed high level" },
    };
    const r = parseJudgeResult(JSON.stringify(oldShape));
    expect(r.guardrails.coaching).toBe("restrained");
    expect(r.guardrails.traineeLine).toBe("we stayed high level");
  });
});

import { judgeResultToScore, deriveGrade } from "./judge-mapping";

const base = (over: Record<string, { score: number }> = {}) => ({
  discovery:     dim(5, "", "x"),
  listening:     dim(5, "", "x"),
  empathy:       dim(5, "", "x"),
  qualification: dim(5, "", "x"),
  guardrails:    dim(5, "", "x"),
  handoff:       dim(5, "", "x"),
  summary: "",
  ...over,
});

describe("judgeResultToScore", () => {
  it("carries the judged 0-10 score straight through per dimension", () => {
    const { breakdown } = judgeResultToScore(
      base({ listening: dim(8, "", "x") }) as never,
      null
    );
    expect(breakdown.listening).toBe(8);
    expect(breakdown.discovery).toBe(5);
  });

  it("normalizes the six 0-10 values over 60", () => {
    // all 5s -> 30 -> 30/60*100 = 50
    const { score } = judgeResultToScore(base() as never, null);
    expect(score).toBe(50);
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
        discovery: dim(10, "", "x"),
        listening: dim(10, "", "x"),
        empathy: dim(8, "", "x"),
        qualification: dim(10, "", "x"),
        handoff: dim(10, "", "x"),
      }) as never,
      "POLITE_EXIT"
    );
    // Forced MQL with no real conversation behind it.
    const badMql = judgeResultToScore(
      base({
        discovery: dim(1),
        listening: dim(1),
        qualification: dim(1),
        handoff: dim(1),
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
    expect(asMql).toBe(50);
    expect(asExit).toBe(50);
    expect(asNone).toBe(50);
  });
});
