/**
 * Discovery-question filter — prevents the attendee from asking
 * sales-style discovery questions that should come from the trainee.
 *
 * The attendee is a prospect.  Prospects ask evaluation questions about
 * the product ("How would that help with alert noise?"), not discovery
 * questions about the other person's workflow ("How does your team
 * handle alerts today?").
 */

// ── Discovery question detection ─────────────────────────────────────────────

const DISCOVERY_PATTERNS: RegExp[] = [
  /how (do|does) (your|you)\b/i,
  /what tools (do|does|are)\b/i,
  /how (are|were) you\b/i,
  /how do you handle\b/i,
  /what does your (process|workflow|team|setup|stack)\b/i,
  /what('s| is) your (process|workflow|setup|stack|approach)\b/i,
  /how do you (currently|typically|usually)\b/i,
  /tell me (about|more about) (your|how you)\b/i,
  /what (are|were) you (using|doing|running)\b/i,
  /how (long|often) (do|does|have) (you|your)\b/i,
];

/**
 * Returns true if the text reads like a sales-discovery question —
 * i.e., the speaker is probing the listener's workflow/tooling.
 *
 * Only triggers on questions (must contain "?").
 */
export function isDiscoveryQuestion(text: string): boolean {
  if (!text.includes("?")) return false;
  return DISCOVERY_PATTERNS.some((p) => p.test(text));
}

// ── Evaluation question bank ─────────────────────────────────────────────────

/**
 * Prospect-appropriate questions about the product being pitched.
 * Used as replacements when a discovery question is detected.
 */
export const EVALUATION_QUESTIONS: string[] = [
  "How would something like that help reduce the alert noise?",
  "Would that fit into an existing incident workflow?",
  "How quickly could a team adopt something like that?",
  "Does it work alongside existing monitoring tools?",
  "How does it help during a real incident?",
];
