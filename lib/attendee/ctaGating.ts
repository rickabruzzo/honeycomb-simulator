/**
 * CTA gating logic.
 *
 * Determines whether to show the session-completion CTA based on:
 *   1. An explicit outcome signal from transcript (badge scan / demo / flyer)
 *   2. A COMMITTED momentum band + commitment keyword in recent text
 *
 * This is intentionally separate from the state-machine so it can fire
 * from any state, not just OUTCOME / SOLUTION_FRAMING.
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

/**
 * Returns true if the CTA should be shown to the trainee.
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
  // Explicit outcome always wins
  if (args.outcomeType !== "NONE") return true;

  // Momentum must reach COMMITTED band (score >= 51)
  const score = args.momentumScore ?? 0;
  const band = getMomentumBand(score);
  if (band !== "COMMITTED") return false;

  // Needs at least one commitment keyword in recent transcript
  const recentText = args.transcript
    .filter((m) => m.type !== "system")
    .slice(-10)
    .map((m) => m.text.toLowerCase())
    .join(" ");

  return COMMITMENT_KEYWORDS.some((kw) => recentText.includes(kw));
}
