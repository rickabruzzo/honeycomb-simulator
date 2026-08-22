/**
 * Pure mapping from a JudgeResult to score fields. Separated from judge.ts (which does I/O)
 * and from scoring.ts (which assembles the full record) so the arithmetic is unit-testable
 * without a provider.
 */

import type { JudgeResult } from "./judge";
import { SCORING_DIMENSIONS } from "./rubric";

export interface MappedScore {
  breakdown: {
    discovery: number;
    listening: number;
    empathy: number;
    qualification: number;
    guardrails: number;
    handoff: number;
  };
  score: number; // 0-100, normalized from the six 0-20 dimensions
  evidence: { dimension: string; quote: string; comment: string }[];
}

function to20(score05: number): number {
  return Math.round((score05 / 5) * 20);
}

/**
 * Map judged 0-5 dimensions to the 0-20 breakdown and a normalized 0-100 score.
 *
 * Outcome quality is scored ONLY through the Handoff dimension — there is no separate outcome
 * nudge or floor, so `detectedOutcome` no longer affects the score (kept in the signature for
 * call-site stability and future use).
 */
export function judgeResultToScore(
  judge: JudgeResult,
  _detectedOutcome: string | null
): MappedScore {
  const breakdown = {
    discovery: to20(judge.discovery.score),
    listening: to20(judge.listening.score),
    empathy: to20(judge.empathy.score),
    qualification: to20(judge.qualification.score),
    guardrails: to20(judge.guardrails.score),
    handoff: to20(judge.handoff.score),
  };

  const sum =
    breakdown.discovery +
    breakdown.listening +
    breakdown.empathy +
    breakdown.qualification +
    breakdown.guardrails +
    breakdown.handoff;

  // Normalize the six 0-20 dimensions (max 120) onto a 0-100 scale.
  const score = Math.min(100, Math.max(0, Math.round((sum / 120) * 100)));

  const evidence = SCORING_DIMENSIONS.map((dim) => ({
    dimension: dim,
    quote: judge[dim].evidence,
    comment: judge[dim].rationale,
  }));

  return { breakdown, score, evidence };
}

export function deriveGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A";
  if (score >= 78) return "B";
  if (score >= 65) return "C";
  if (score >= 50) return "D";
  return "F";
}
