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

  // ── Authority / budget signal → BADGE_SCAN (highest priority) ────────────
  // "No one talks numbers unless they're in charge of numbers." When the attendee raises
  // budget, per-seat/team pricing, procurement, a team rollout, or their own decision
  // authority, that IS the buying-authority signal — the read is sales-qualified (MQL),
  // even without an explicit "scan my badge." Keep these anchored to ownership/rollout
  // language so a curious IC asking a bare "is there a free tier?" stays a postcard.
  if (
    // budget ownership / approval
    /\b(our|my|the|your) (team s |teams )?budget\b/.test(t) ||
    /\bbudget (for|to|owner|holder|approv)/.test(t) ||
    /\b(get|need|secure|approve|approved|run) (the )?(budget|approval|sign off|signoff|buy in|purchase)\b/.test(t) ||
    // procurement / contract / renewal
    /\bprocurement\b/.test(t) ||
    /\b(annual|enterprise) (contract|plan|pricing|agreement|deal|license)\b/.test(t) ||
    /\bcurrent (spend|contract|tooling budget)\b/.test(t) ||
    /\brenewal\b/.test(t) ||
    // per-seat / per-team pricing (talking numbers for a group = authority)
    /\b(pricing|price|cost|how much|rates?) (for|per|across) (a |an |our |my |the )?(team|seat|user|org|month|year|enterprise|company)/.test(t) ||
    /\bper (seat|user) (pricing|price|cost)\b/.test(t) ||
    /\b(seats|licenses|users) (for|do we|would we|per|across)\b/.test(t) ||
    // explicit decision authority
    /\bi ?(m| am)?( the)? (decision maker|buyer|budget (owner|holder))\b/.test(t) ||
    /\bi (decide|choose|pick|own|approve|sign off on|am responsible for)\b/.test(t) ||
    /\b(my|our) (call|decision|budget|spend)\b/.test(t) ||
    /\bi (manage|lead|run|own|head up|oversee) (a |an |the |my |our )?(team|org|group|platform|department|engineers|engineering)\b/.test(t) ||
    // team rollout / evaluating for a group
    /\broll (this|it) out\b/.test(t) ||
    /\bteam ?wide\b/.test(t) ||
    /\b(standardiz|pilot|evaluat|bring|take) \w* ?(this|it)? ?(for|to|across|back to|with) (my|our|the) (team|org|company|group|engineering)\b/.test(t) ||
    /\bset up (a |the )?(demo|call|time|meeting) for (my|our|the) (team|org|group|company)\b/.test(t) ||
    /\bacross (the|our) (org|team|company|engineering|department)\b/.test(t)
  ) return "BADGE_SCAN";

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
 * Scan the last 12 attendee messages for the strongest outcome signal.
 * Only attendee messages are scanned — trainee text must never trigger a CTA.
 * Priority order: BADGE_SCAN > DEMO > FLYER > NONE.
 *
 * @param transcript - Array of session transcript messages
 */
export function detectOutcomeFromTranscript(
  transcript: Array<{ type: "system" | "trainee" | "attendee"; text: string }>
): OutcomeSignalType {
  const recent = transcript
    .filter((m) => m.type === "attendee") // attendee-only: trainee text must never trigger CTA
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
