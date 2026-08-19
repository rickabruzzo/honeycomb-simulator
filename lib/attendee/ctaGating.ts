/**
 * CTA gating logic.
 *
 * Determines whether to show the session-completion CTA based on:
 *   1. An explicit attendee outcome signal (badge scan / demo / flyer)
 *      combined with minimum conversation depth requirements.
 *   2. A COMMITTED momentum band + minimum depth + commitment keyword
 *      as a conservative fallback path.
 *
 * Outcome detection is always attendee-only (enforced in outcomeSignals.ts).
 * Trainee text MUST NOT trigger a CTA through any path.
 */

import type { OutcomeSignalType } from "./outcomeSignals";
import { getMomentumBand } from "./momentumBands";

const COMMITMENT_KEYWORDS = [
  "scan my badge",
  "scan your badge",
  "follow up",
  "reach out",
  "demo",
  "show me",
  "docs",
  "free tier",
  "sign up",
  "check it out",
];

// ── Depth helpers ──────────────────────────────────────────────────────────

function countAttendeeMessages(
  transcript: Array<{ type: "system" | "trainee" | "attendee" }>
): number {
  return transcript.filter((m) => m.type === "attendee").length;
}

function countTotalMessages(
  transcript: Array<{ type: "system" | "trainee" | "attendee" }>
): number {
  return transcript.filter((m) => m.type !== "system").length;
}

// ── CTA gate ───────────────────────────────────────────────────────────────

/**
 * Returns true if the CTA should be shown to the trainee.
 *
 * Minimum depth requirements prevent early false-positives:
 *
 *   BADGE_SCAN / DEMO  — strong intent signals:
 *     requires >= 2 attendee messages AND >= 4 total messages
 *
 *   FLYER              — weaker intent (docs / self-serve):
 *     requires >= 2 attendee messages AND >= 6 total messages
 *     AND momentum band at least ENGAGED
 *
 *   No explicit outcome — conservative fallback:
 *     requires COMMITTED momentum band
 *     AND >= 3 attendee messages AND >= 8 total messages
 *     AND at least one commitment keyword in the last 10 turns
 *
 * @param args.outcomeType   - Explicit outcome signal detected (or "NONE")
 * @param args.momentumScore - Current momentum score (0-100)
 * @param args.transcript    - Full session transcript
 */
export function shouldShowCTA(args: {
  outcomeType: OutcomeSignalType;
  momentumScore?: number;
  transcript: Array<{ type: "system" | "trainee" | "attendee"; text: string }>;
}): boolean {
  const attendeeCount = countAttendeeMessages(args.transcript);
  const totalCount = countTotalMessages(args.transcript);

  if (args.outcomeType !== "NONE") {
    // Strong signals: badge scan or demo request
    if (args.outcomeType === "BADGE_SCAN" || args.outcomeType === "DEMO") {
      return attendeeCount >= 2 && totalCount >= 4;
    }

    // Weaker signal: docs / self-serve — needs more depth and ENGAGED momentum
    const band = getMomentumBand(args.momentumScore ?? 0);
    const isAtLeastEngaged = band === "ENGAGED" || band === "COMMITTED";
    return attendeeCount >= 2 && totalCount >= 6 && isAtLeastEngaged;
  }

  // Conservative fallback: COMMITTED band + depth + keyword
  const band = getMomentumBand(args.momentumScore ?? 0);
  if (band !== "COMMITTED") return false;

  if (attendeeCount < 3 || totalCount < 8) return false;

  // Needs at least one commitment keyword in recent transcript
  const recentText = args.transcript
    .filter((m) => m.type !== "system")
    .slice(-10)
    .map((m) => m.text.toLowerCase())
    .join(" ");

  return COMMITMENT_KEYWORDS.some((kw) => recentText.includes(kw));
}
