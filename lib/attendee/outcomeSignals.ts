/**
 * Outcome signal detection from transcript text.
 *
 * Scans individual messages and full transcript windows for explicit
 * outcome signals — state-agnostic. This is the companion to
 * lib/outcomeCommitment.ts which gates the CTA on a single message;
 * this module scans the last N turns so we never miss a signal that
 * arrived before the state machine caught up.
 *
 * OutcomeType maps to existing outcome strings used by outcomeActions:
 *   BADGE_SCAN  → "MQL_READY"
 *   DEMO        → "DEMO_READY"
 *   FLYER       → "SELF_SERVICE_READY"
 *   NONE        → no CTA
 */

export type OutcomeSignalType = "BADGE_SCAN" | "DEMO" | "FLYER" | "NONE";

/**
 * Map an OutcomeSignalType to the committed-outcome string expected by
 * getOutcomeAction() / shouldShowCompletionCTA().
 */
export function outcomeSignalToCommittedOutcome(
  signal: OutcomeSignalType
): string | null {
  switch (signal) {
    case "BADGE_SCAN": return "MQL_READY";
    case "DEMO":       return "DEMO_READY";
    case "FLYER":      return "SELF_SERVICE_READY";
    default:           return null;
  }
}

/**
 * Detect the strongest outcome signal from a single message.
 */
export function detectOutcomeFromText(text: string): OutcomeSignalType {
  const t = text.toLowerCase().trim().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ");

  // ── Badge scan / sales follow-up (highest priority) ──────────────────────
  if (
    /\bscan (my|your|the) badge\b/.test(t) ||
    /\bcan you scan my badge\b/.test(t) ||
    /\b(can|could) (someone|you) (follow up|reach out)\b/.test(t) ||
    /\b(can|could) i get a follow[ -]?up\b/.test(t) ||
    /\btake my (badge|info|card)\b/.test(t) ||
    /\bconnect (me|us) with (sales|someone)\b/.test(t) ||
    /\b(talk|speak) to sales\b/.test(t) ||
    /\bhave (sales|someone) (follow up|reach out|contact me)\b/.test(t) ||
    /\bschedule a call\b/.test(t) ||
    /\bbook a call\b/.test(t) ||
    /\bget in touch\b/.test(t) ||
    /\bmy (email|contact info)\b/.test(t)
  ) return "BADGE_SCAN";

  // ── Demo intent ───────────────────────────────────────────────────────────
  if (
    /\b(can|could) you (show|demo)\b/.test(t) ||
    /\bshow me (how|this|a demo|it)\b/.test(t) ||
    /\bquick demo\b/.test(t) ||
    /\bschedule (a )?demo\b/.test(t) ||
    /\bbook (a )?demo\b/.test(t) ||
    /\bset up (a )?demo\b/.test(t) ||
    /\bid (like|love) (a |to see a )?demo\b/.test(t) ||
    /\bwalk me through\b/.test(t) ||
    /\bsee it in action\b/.test(t) ||
    /\bwho (can|does) demo\b/.test(t) ||
    /\bcan (we|someone) walk through\b/.test(t)
  ) return "DEMO";

  // ── Flyer / docs / self-serve exit ───────────────────────────────────────
  if (
    /\bhand (me|us) (a )?(flyer|one[ -]?pager)\b/.test(t) ||
    /\b(just )?send me (the )?docs\b/.test(t) ||
    /\bi( d| would) rather read\b/.test(t) ||
    /\bpoint me to (the )?docs\b/.test(t) ||
    /\bcheck out the free tier\b/.test(t) ||
    /\btry the free tier\b/.test(t) ||
    /\bsign up for (the )?free tier\b/.test(t) ||
    /\bwhere (can|do) i sign up\b/.test(t) ||
    /\bi( ll| will) try it (myself|out)?\b/.test(t) ||
    /\bi( ll| will) check it out\b/.test(t) ||
    /\bsend me (the )?(links|resources)\b/.test(t)
  ) return "FLYER";

  return "NONE";
}

/**
 * Scan the last 12 transcript entries for the strongest outcome signal.
 * Attendee signals are treated as equal weight to trainee — both matter.
 * Priority order: BADGE_SCAN > DEMO > FLYER > NONE.
 *
 * @param transcript - Array of session transcript messages
 */
export function detectOutcomeFromTranscript(
  transcript: Array<{ type: "system" | "trainee" | "attendee"; text: string }>
): OutcomeSignalType {
  const recent = transcript
    .filter((m) => m.type !== "system")
    .slice(-12);

  let best: OutcomeSignalType = "NONE";

  for (const msg of recent) {
    const signal = detectOutcomeFromText(msg.text);
    if (signal === "BADGE_SCAN") return "BADGE_SCAN"; // short-circuit on highest
    // After the return above, signal is narrowed to "DEMO" | "FLYER" | "NONE"
    if (signal === "DEMO") best = "DEMO";
    if (signal === "FLYER" && best === "NONE") best = "FLYER";
  }

  return best;
}
