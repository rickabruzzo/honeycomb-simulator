/**
 * Outcome commitment detectors - HIGH PRECISION gates for CTA display.
 *
 * These detectors answer: "Did the attendee explicitly commit to a next step?"
 * Only show CTA when commitment is detected.
 *
 * Separate from outcome eligibility (which is used for scoring/telemetry).
 */

/**
 * Normalize text for matching: lowercase, strip punctuation, collapse whitespace.
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check if text contains any of the given phrases.
 */
function containsAny(text: string, phrases: string[]): boolean {
  const normalized = normalizeText(text);
  return phrases.some((phrase) => normalized.includes(normalizeText(phrase)));
}

/**
 * Detect explicit demo commitment.
 *
 * HIGH PRECISION: Only match when attendee explicitly requests/accepts a demo.
 *
 * @param text - Attendee message text
 * @returns true if demo commitment detected
 */
export function detectDemoCommitment(text: string): boolean {
  const demoCommitmentPhrases = [
    // Direct demo requests
    "can you show me",
    "can i see",
    "show me a demo",
    "show me how",
    "is there a demo",
    "let's do a demo",
    "can we walk through",
    "can you walk me through",
    "i'd like a demo",
    "i'd love a demo",
    "i want to see a demo",
    "who can demo",
    "can someone demo",
    "walk me through",

    // Scheduling/deferred demo
    "schedule a demo",
    "set up a demo",
    "book a demo",
    "arrange a demo",

    // Show/see in action
    "see it in action",
    "show me in practice",
    "see how it works",

    // Pass to demoer
    "talk to the demo person",
    "who does demos",
    "get a demo from",
  ];

  return containsAny(text, demoCommitmentPhrases);
}

/**
 * Detect explicit MQL commitment (badge scan / sales follow-up).
 *
 * HIGH PRECISION: Only match when attendee explicitly requests sales contact.
 *
 * @param text - Attendee message text
 * @returns true if MQL commitment detected
 */
export function detectMqlCommitment(text: string): boolean {
  const mqlCommitmentPhrases = [
    // Badge scan
    "scan my badge",
    "can you scan my badge",
    "let me scan",
    "get my badge",
    "take my badge",

    // Sales follow-up
    "have someone follow up",
    "can someone follow up",
    "have sales follow up",
    "have someone reach out",
    "can someone reach out",
    "reach out after",
    "follow up with me",
    "contact me later",
    "get in touch",

    // Schedule call
    "schedule a call",
    "set up a call",
    "can we schedule",
    "book a call",

    // Talk to sales
    "talk to sales",
    "speak to sales",
    "connect me with sales",
    "who's the sales person",

    // Give contact info
    "here's my email",
    "my contact info",
    "take my info",
    "let me give you my",
  ];

  return containsAny(text, mqlCommitmentPhrases);
}

/**
 * Detect explicit self-service commitment.
 *
 * HIGH PRECISION: Only match when attendee explicitly requests docs/free tier
 * as their next step (not just curiosity).
 *
 * @param text - Attendee message text
 * @returns true if self-service commitment detected
 */
export function detectSelfServiceCommitment(text: string): boolean {
  const selfServiceCommitmentPhrases = [
    // Free tier explicit
    "i'll try the free tier",
    "start with the free tier",
    "free tier is",
    "point me to the free tier",
    "sign up for free tier",
    "check out the free tier",

    // Docs explicit
    "send me the docs",
    "point me to the docs",
    "i'll read the docs",
    "i'll check out the docs",
    "where are the docs",
    "link to the docs",
    "documentation link",

    // Self-serve intent
    "i'll try it myself",
    "i'll check it out",
    "i'll poke around",
    "i'll dig in",
    "i want to try it",
    "let me try it",
    "i'll play with it",
    "i'll experiment",

    // Sign-up
    "where can i sign up",
    "how do i sign up",
    "i'll sign up",
    "create an account",

    // Learn more (when clearly a next step)
    "send me the links",
    "send me the resources",
    "i'll learn more on my own",
  ];

  return containsAny(text, selfServiceCommitmentPhrases);
}

/**
 * Detect explicit deferred interest commitment.
 *
 * Match when attendee explicitly states timing isn't right but maintains interest.
 *
 * @param text - Attendee message text
 * @returns true if deferred interest commitment detected
 */
export function detectDeferredCommitment(text: string): boolean {
  const deferredCommitmentPhrases = [
    // Timing objections
    "on our radar",
    "not this quarter",
    "next quarter",
    "next year",
    "later this year",
    "not ready yet",
    "not ready right now",
    "after our migration",
    "after we finish",
    "down the road",
    "in the future",
    "when we're ready",
    "when things settle",

    // Evaluating but not now
    "keep you on the radar",
    "circle back later",
    "revisit this later",
    "touch base in",

    // Interested but blocked
    "interested but",
    "sounds good but",
    "promising but",
  ];

  return containsAny(text, deferredCommitmentPhrases);
}

/**
 * Detect any outcome commitment (convenience function).
 *
 * @param text - Attendee message text
 * @returns Committed outcome or null
 */
export function detectCommittedOutcome(text: string): string | null {
  // Priority order matches outcome priority
  if (detectMqlCommitment(text)) return "MQL_READY";
  if (detectDemoCommitment(text)) return "DEMO_READY";
  if (detectSelfServiceCommitment(text)) return "SELF_SERVICE_READY";
  if (detectDeferredCommitment(text)) return "DEFERRED_INTEREST";

  return null;
}
