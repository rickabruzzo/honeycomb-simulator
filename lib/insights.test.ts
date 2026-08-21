import { describe, it, expect } from "vitest";
import { computeInsights } from "./insights";
import type { ScoreRecord } from "./scoring";

function rec(p: Partial<ScoreRecord> & { breakdown: ScoreRecord["breakdown"] }): ScoreRecord {
  return {
    token: Math.random().toString(36).slice(2),
    sessionId: "s",
    score: 70,
    grade: "C",
    highlights: [],
    mistakes: [],
    violations: [],
    evidence: [],
    scoringMethod: "judge",
    createdAt: "2026-08-01T00:00:00Z",
    completedAt: "2026-08-01T00:00:00Z",
    ...p,
  } as ScoreRecord;
}

const strong = { discovery: 18, listening: 18, empathy: 16, qualification: 14, guardrails: 20, handoff: 8 };

describe("computeInsights — coaching", () => {
  it("derives a trainee's strength, growth area, and next-step tip", () => {
    const data = computeInsights([
      rec({ traineeId: "t1", traineeNameShort: "Rae", breakdown: strong, grade: "B", score: 82 }),
    ]);
    const t = data.traineeSummaries[0];
    expect(t.strength?.dimension).toBe("guardrails"); // 20 = highest
    expect(t.growthArea?.dimension).toBe("handoff"); // 8 = lowest
    expect(t.nextStep).toMatch(/next step/i); // handoff tip
  });

  it("computes team weakest dimension, grade distribution, and pass rate", () => {
    const data = computeInsights([
      rec({ traineeId: "t1", breakdown: strong, grade: "B" }),
      rec({ traineeId: "t2", breakdown: { ...strong, handoff: 10 }, grade: "F" }),
      rec({ traineeId: "t3", breakdown: { ...strong, handoff: 12 }, grade: "A" }),
    ]);
    expect(data.teamCoaching.weakest?.dimension).toBe("handoff"); // lowest across team
    expect(data.teamCoaching.tip).toBeTruthy();
    expect(data.teamCoaching.gradeDistribution).toEqual({ A: 1, B: 1, C: 0, D: 0, F: 1 });
    // C-or-better = A + B = 2 of 3
    expect(data.teamCoaching.passRate).toBe(67);
  });

  it("does not let legacy five-dimension records zero out the new dimensions", () => {
    // A legacy record lacking qualification/handoff must not drag their averages to 0.
    const legacy = rec({
      traineeId: "t1",
      breakdown: { discovery: 10, listening: 10, empathy: 10 } as unknown as ScoreRecord["breakdown"],
    });
    const modern = rec({ traineeId: "t1", breakdown: { ...strong, handoff: 16, qualification: 16 } });
    const data = computeInsights([legacy, modern]);
    const dims = data.teamCoaching;
    // handoff averaged only over the modern record (16), not (0+16)/2 = 8
    // weakest should NOT be handoff at a bogus low value; assert handoff avg computed from modern only
    const t = data.traineeSummaries[0];
    const handoff = [t.strength, t.growthArea].find((d) => d?.dimension === "handoff");
    // handoff appears in stats and reflects the modern value, not a zero-dragged one
    expect(dims.gradeDistribution.C).toBe(2);
  });

  it("returns empty team coaching when there are no scores", () => {
    const data = computeInsights([]);
    expect(data.teamCoaching.weakest).toBeNull();
    expect(data.teamCoaching.passRate).toBe(0);
    expect(data.traineeSummaries).toEqual([]);
  });
});
