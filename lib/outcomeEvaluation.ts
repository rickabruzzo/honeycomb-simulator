/**
 * Evaluation question detector - blocks premature CTA on mid-funnel questions.
 *
 * Evaluation questions are normal discovery/qualification questions that should
 * NOT trigger session end. They indicate active engagement, not exit intent.
 */

/**
 * Detect if attendee message is an evaluation question (not an exit/commitment).
 *
 * Evaluation questions are mid-funnel: rollout effort, bandwidth, complexity, etc.
 * These should NOT trigger CTAs - they're normal conversation flow.
 *
 * @param text - Attendee message text
 * @returns true if evaluation question detected
 */
export function isEvaluationQuestion(raw: string): boolean {
  const t = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!t) return false;

  const patterns = [
    "how much effort",
    "rollout",
    "what does that look like",
    "how heavy",
    "heavy lift",
    "bandwidth",
    "how hard",
    "integration effort",
    "instrumentation effort",
    "time to value",
    "how long to get value",
    "complexity",
    "setup time",
    "how long does it take",
    "what's involved",
    "migration path",
    "learning curve",
    "onboarding time",
    "team capacity",
    "resource requirements",
    "what's the process",
    "how does that work",
    "implementation",
  ];

  return patterns.some((p) => t.includes(p));
}
