/**
 * Reply length as an instructed budget rather than a fixed truncation.
 *
 * postProcessAttendeeText used to clip every reply to 2 sentences / 220 chars, including
 * LLM output. That made empathy-triggered venting and incident war stories - the designated
 * reward for good listening - impossible to deliver no matter what the prompt asked for.
 *
 * The cap is still right for the deterministic template banks, which are one-liners by
 * design, so it stays the default. The LLM path passes a phase-derived budget instead.
 *
 * Phase 1 keys off conversation phase only. A later phase should key off earned trust, so a
 * listened-to attendee visibly opens up and an interrupted one visibly closes down.
 */

export interface LengthBudget {
  minSentences: number;
  maxSentences: number;
}

export interface PostProcessLimits {
  maxSentences: number;
  maxChars: number;
}

const BUDGETS: Record<string, LengthBudget> = {
  ICEBREAKER: { minSentences: 1, maxSentences: 2 },
  EXPLORATION: { minSentences: 2, maxSentences: 3 },
  PAIN_DISCOVERY: { minSentences: 2, maxSentences: 6 },
  SOLUTION_FRAMING: { minSentences: 2, maxSentences: 4 },
  OUTCOME: { minSentences: 1, maxSentences: 3 },
};

const FALLBACK: LengthBudget = { minSentences: 2, maxSentences: 3 };

/** Roughly one spoken sentence. Used to derive a character ceiling from a sentence budget. */
const CHARS_PER_SENTENCE = 200;

/** The historical template allowance. The derived ceiling never drops below it. */
const LEGACY_MAX_CHARS = 220;

export function getLengthBudget(phase: string): LengthBudget {
  return BUDGETS[phase] ?? FALLBACK;
}

export function renderLengthDirective(budget: LengthBudget): string {
  if (budget.maxSentences <= 1) {
    return "LENGTH: One sentence. You are not in the mood to say more right now.";
  }
  return (
    `LENGTH: Roughly ${budget.minSentences} to ${budget.maxSentences} sentences. ` +
    "Say what this moment actually warrants - no padding, and do not cut a story short " +
    "if you have decided to tell it."
  );
}

export function budgetToPostProcessOptions(budget: LengthBudget): PostProcessLimits {
  return {
    maxSentences: budget.maxSentences,
    maxChars: Math.max(LEGACY_MAX_CHARS, budget.maxSentences * CHARS_PER_SENTENCE),
  };
}
