/**
 * Pure mapping from a JudgeResult to score fields. Separated from judge.ts (which does I/O)
 * and from scoring.ts (which assembles the full record) so the arithmetic is unit-testable
 * without a provider.
 */

import type { JudgeResult } from "./judge";
import { SCORING_DIMENSIONS } from "./rubric";

export interface MappedScore {
  breakdown: {
    listening: number;
    discovery: number;
    empathy: number;
    otel_assumptions: number;
    guardrails: number;
  };
  score: number; // 0-100 including the outcome nudge
  evidence: { dimension: string; quote: string; comment: string }[];
}

const SUCCESS_OUTCOMES = new Set(["DEMO", "BADGE_SCAN", "DEMO_READY", "MQL_READY"]);

function to20(score05: number): number {
  return Math.round((score05 / 5) * 20);
}

export function judgeResultToScore(
  judge: JudgeResult,
  detectedOutcome: string | null
): MappedScore {
  const breakdown = {
    listening: to20(judge.listening.score),
    discovery: to20(judge.discovery.score),
    empathy: to20(judge.empathy.score),
    otel_assumptions: to20(judge.otel_assumptions.score),
    guardrails: to20(judge.guardrails.score),
  };

  let score =
    breakdown.listening +
    breakdown.discovery +
    breakdown.empathy +
    breakdown.otel_assumptions +
    breakdown.guardrails;

  // Outcome informs, does not floor. The nudge is withheld unless the conversation was
  // actually conducted well, so closing cannot rescue a poorly-run session.
  const earned = judge.discovery.score >= 3 && judge.listening.score >= 3;
  if (detectedOutcome && SUCCESS_OUTCOMES.has(detectedOutcome) && earned) {
    score += 5;
  }

  score = Math.min(100, Math.max(0, score));

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
