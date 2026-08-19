/**
 * Post-processor for attendee responses.
 * Enforces realism rules: no bullets, no italics, no parentheticals, max length, OTel terminology.
 */

import type { Persona } from "../scenarioTypes";
import { enforceOTelTerminology } from "./otelTerminology";

export interface PostProcessLimits {
  maxSentences: number;
  maxChars: number;
}

/**
 * Default limits. These are the historical values and suit the deterministic template
 * banks, which are one-liners by design.
 *
 * They are deliberately NOT right for LLM output: clipping every reply to two sentences
 * made empathy-triggered venting and incident war stories impossible to deliver, which is
 * the whole reward for good listening. The LLM path passes an explicit budget instead
 * (see lib/attendee/lengthBudget.ts).
 */
const DEFAULT_LIMITS: PostProcessLimits = { maxSentences: 2, maxChars: 220 };

/**
 * Post-process attendee text to enforce realism rules.
 *
 * @param text - The raw attendee response text
 * @param persona - Optional persona for OTel terminology enforcement
 * @param limits - Optional length allowance; defaults to the template-sized limits
 */
export function postProcessAttendeeText(
  text: string,
  persona?: Persona,
  limits?: Partial<PostProcessLimits>
): string {
  const { maxSentences, maxChars } = { ...DEFAULT_LIMITS, ...limits };
  let processed = text;

  // Remove bullets and numbering at start of lines
  processed = processed.replace(/^[\s]*[-•*]\s*/gm, "");
  processed = processed.replace(/^[\s]*\d+\.\s*/gm, "");

  // Remove parentheses stage directions
  processed = processed.replace(/\([^)]*\)/g, "");

  // Remove markdown formatting
  processed = processed.replace(/[*_`]/g, "");

  // Remove "What about you?" / "How about you?" style questions
  processed = processed.replace(/what about you\??/gi, "");
  processed = processed.replace(/how about you\??/gi, "");
  processed = processed.replace(/what about your\s+\w+\??/gi, "");
  processed = processed.replace(/how about your\s+\w+\??/gi, "");

  // Collapse multiple spaces
  processed = processed.replace(/\s+/g, " ");

  // Trim
  processed = processed.trim();

  // FIX: Remove leading punctuation (". Can you help with that?" → "Can you help with that?")
  // Matches leading periods, commas, semicolons, colons, hyphens followed by optional whitespace
  processed = processed.replace(/^[\.\,\;\:\-]\s*/, "");

  // Enforce the sentence allowance (split on . ! ?)
  const sentences = processed.match(/[^.!?]+[.!?]+/g);
  if (sentences && sentences.length > maxSentences) {
    processed = sentences.slice(0, maxSentences).join(" ").trim();
  }

  // Enforce the character allowance
  if (processed.length > maxChars) {
    const truncated = processed.substring(0, maxChars);
    const lastTerminator = Math.max(
      truncated.lastIndexOf("."),
      truncated.lastIndexOf("!"),
      truncated.lastIndexOf("?")
    );

    if (lastTerminator > 0) {
      processed = truncated.substring(0, lastTerminator + 1).trim();
    } else {
      processed = truncated.trim() + "...";
    }
  }

  // Enforce OTel terminology based on persona familiarity
  if (persona) {
    processed = enforceOTelTerminology(processed, persona);
  }

  return processed;
}
