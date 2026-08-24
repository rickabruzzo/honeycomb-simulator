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
  score: number; // 0-100, normalized from the six 0-10 dimensions
  evidence: {
    dimension: string;
    /** The attendee's verbatim line the feedback is grounded in, or "". */
    attendeeQuote: string;
    /** The trainee's verbatim line being credited or critiqued, or "". */
    quote: string;
    /** The concrete coaching line for this dimension. */
    comment: string;
  }[];
}

function clamp10(score: number): number {
  return Math.min(10, Math.max(0, Math.round(score)));
}

/**
 * Map judged 0-10 dimensions to the 0-10 breakdown and a normalized 0-100 score.
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
    discovery: clamp10(judge.discovery.score),
    listening: clamp10(judge.listening.score),
    empathy: clamp10(judge.empathy.score),
    qualification: clamp10(judge.qualification.score),
    guardrails: clamp10(judge.guardrails.score),
    handoff: clamp10(judge.handoff.score),
  };

  const sum =
    breakdown.discovery +
    breakdown.listening +
    breakdown.empathy +
    breakdown.qualification +
    breakdown.guardrails +
    breakdown.handoff;

  // Normalize the six 0-10 dimensions (max 60) onto a 0-100 scale.
  const score = Math.min(100, Math.max(0, Math.round((sum / 60) * 100)));

  const evidence = SCORING_DIMENSIONS.map((dim) => ({
    dimension: dim,
    attendeeQuote: judge[dim].attendeeLine,
    quote: judge[dim].traineeLine,
    comment: judge[dim].coaching,
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
