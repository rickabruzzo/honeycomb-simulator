/**
 * Post-processor for attendee responses.
 * Enforces realism rules: no bullets, no italics, no parentheticals, max length.
 */

/**
 * Post-process attendee text to enforce realism rules.
 */
export function postProcessAttendeeText(text: string): string {
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

  // Enforce max 2 sentences (split on . ! ?)
  const sentences = processed.match(/[^.!?]+[.!?]+/g);
  if (sentences && sentences.length > 2) {
    processed = sentences.slice(0, 2).join(" ").trim();
  }

  // Enforce max ~220 characters
  if (processed.length > 220) {
    // Find last sentence terminator before 220
    const truncated = processed.substring(0, 220);
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

  return processed;
}
