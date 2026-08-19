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
