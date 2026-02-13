/**
 * Phase 1: Minimal momentum tracking (no behavior changes)
 * Tracks conversation momentum via simple heuristics
 */

export type ConversationMomentum = {
  score: number;
  turn: number;
  lastUpdatedAt: string;
};

const BASELINE_SCORE = 0;

/**
 * Initialize momentum for new sessions
 */
export function initializeMomentum(): ConversationMomentum {
  return {
    score: BASELINE_SCORE,
    turn: 0,
    lastUpdatedAt: new Date().toISOString(),
  };
}

/**
 * Update momentum based on message event
 * Simple heuristics:
 * - Increment turn counter
 * - Adjust score based on message characteristics
 */
export function updateMomentum(
  m: ConversationMomentum,
  event: { kind: "trainee" | "attendee"; text: string }
): ConversationMomentum {
  const text = event.text.toLowerCase();
  let scoreDelta = 0;

  // Question marks suggest engagement
  const questionCount = (event.text.match(/\?/g) || []).length;
  scoreDelta += questionCount * 2;

  // Positive signals
  if (text.includes("thanks") || text.includes("thank you")) {
    scoreDelta += 3;
  }
  if (text.includes("interesting") || text.includes("helpful")) {
    scoreDelta += 2;
  }
  if (text.includes("demo") || text.includes("meeting") || text.includes("follow up")) {
    scoreDelta += 5;
  }

  // Negative signals
  if (text.includes("not interested") || text.includes("no thanks")) {
    scoreDelta -= 5;
  }
  if (text.includes("too busy") || text.includes("no time")) {
    scoreDelta -= 3;
  }

  // Very short messages suggest disengagement (unless it's a question)
  if (text.length < 20 && questionCount === 0) {
    scoreDelta -= 1;
  }

  // Longer, substantive messages suggest engagement
  if (text.length > 100) {
    scoreDelta += 2;
  }

  return {
    score: m.score + scoreDelta,
    turn: m.turn + 1,
    lastUpdatedAt: new Date().toISOString(),
  };
}
