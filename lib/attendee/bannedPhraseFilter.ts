/**
 * Banned Phrase Filter
 *
 * Prevents attendee personas from asking "process advice" questions that are
 * unrealistic at conference booths. Real booth attendees do NOT ask booth staff
 * to run their business or define their rollout process.
 *
 * This filter catches and blocks:
 * - "What should we do next?" and variants
 * - "Tell me what to do" and variants
 * - "What's the right/best approach?" (process framing)
 * - "What do you recommend we do/proceed/implement?" (scoped to process advice)
 *
 * Realistic booth questions that ARE allowed:
 * - "Can you show me a demo?"
 * - "Do you have docs I can read?"
 * - "Is there a free tier?"
 * - "How hard is rollout?" (evaluation, not commitment)
 * - "What's the instrumentation effort?" (evaluation, not commitment)
 * - "Can I scan my badge for follow-up?"
 */

import type { Persona } from "../scenarioTypes";

/**
 * Banned phrase patterns
 *
 * These regex patterns identify phrases that represent unrealistic
 * "process advice" questions at conference booths.
 *
 * IMPORTANT: "Recommend" patterns are scoped to avoid false positives
 * (e.g., "recommend a demo" is fine, "recommend we proceed" is banned)
 */
export const BANNED_PHRASE_PATTERNS = [
  // "Next step" variants
  /what would you recommend as a next step/i,
  /what'?s the best next step/i,
  /what should (?:we|I) do next/i,
  /recommend.*next step/i,

  // "Tell me what to do" variants
  /tell (?:us|me) what to do/i,
  /what do you think we should do/i,
  /what would you do in (?:our|my) situation/i,

  // "Right/best approach" process advice
  /what'?s the right approach/i,
  /what'?s the best approach/i,
  /how should we proceed/i,

  // "Recommend" with process framing (scoped to avoid banning "recommend a demo")
  /what do you recommend (?:we|I) (?:do|proceed|implement|start|roll out)/i,
  /recommend.*(?:proceed|approach|implement|roll out|start)/i,

  // "Tell me how to" with process framing
  /tell me how to (?:proceed|roll (?:this )?out|implement)/i,
];

/**
 * Check if text contains any banned phrases
 *
 * @param text - The response text to check
 * @returns true if text contains banned phrases, false otherwise
 */
export function containsBannedPhrase(text: string): boolean {
  return BANNED_PHRASE_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Generate a fallback question from persona question bank
 *
 * When a banned phrase is detected, this function selects an appropriate
 * fallback question from the persona's question bank (evaluation or technical
 * category preferred).
 *
 * @param persona - The persona to generate fallback for
 * @returns A realistic booth question
 */
export function generateFallbackQuestion(persona: Persona): string {
  // Try to select from persona question bank (evaluation or technical category)
  if (persona.questionBank && persona.questionBank.length > 0) {
    const candidates = persona.questionBank.filter(
      (q) => q.category === "evaluation" || q.category === "technical"
    );

    if (candidates.length > 0) {
      const selected = candidates[Math.floor(Math.random() * candidates.length)];
      return selected.question;
    }

    // Fall back to any question from bank
    const anyQuestion = persona.questionBank[Math.floor(Math.random() * persona.questionBank.length)];
    return anyQuestion.question;
  }

  // Ultimate fallback if persona has no question bank
  return "Can you show me how this works?";
}

/**
 * Validate and sanitize attendee response
 *
 * If response contains banned phrases, replace with fallback question.
 *
 * @param text - The candidate response text
 * @param persona - The persona for fallback generation
 * @returns Sanitized response text
 */
export function sanitizeResponse(text: string, persona: Persona): string {
  if (containsBannedPhrase(text)) {
    return generateFallbackQuestion(persona);
  }
  return text;
}
