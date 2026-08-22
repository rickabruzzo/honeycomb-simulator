/**
 * How much the attendee opens up on this turn — the mechanic that makes listening pay off.
 *
 * Before this, disclosure and reply length keyed off the conversation PHASE alone
 * (getLengthBudget(phase)). That meant a trainee who steamrolled still got the long, candid
 * answer the moment the conversation reached PAIN_DISCOVERY — openness was a function of
 * which topic was on the table, not of whether the trainee had earned it.
 *
 * The reveal budget combines two things:
 *   - PHASE: what is legitimately on the table (you cannot vent about incidents at the
 *     icebreaker; the subject has not come up).
 *   - BAND: how much trust the trainee has earned, from the momentum model — GUARDED when
 *     they pitched early or ignored answers, up to COMMITTED when they listened and reflected.
 *
 * So the war story is reachable only when BOTH the phase allows it AND the trainee has earned
 * it. A listened-to attendee visibly opens up; a bulldozed one visibly closes down, and the
 * trainee feels it in the length and candor of the replies rather than only in the scorecard.
 *
 * The generator never sees the band or a score — only a natural-language directive — because
 * numeric state in a prompt tends to leak into the dialogue.
 */

import type { LengthBudget } from "./lengthBudget";
import { getLengthBudget } from "./lengthBudget";
import type { MomentumBand } from "./momentumBands";

export type VentDepth = "none" | "brief" | "war_story";

export interface RevealBudget {
  lengthBudget: LengthBudget;
  ventDepth: VentDepth;
  /** Natural-language instruction for the generator. Never contains a number. */
  opennessDirective: string;
}

/** Phases where complaining about real pain is on the table at all. */
const PAIN_PHASES = new Set(["PAIN_DISCOVERY", "SOLUTION_FRAMING", "OUTCOME"]);

/**
 * How wide the band lets the attendee open up, as a ceiling on sentences. The phase budget is
 * the upper bound of what the topic warrants; the band caps it by what was earned.
 */
const BAND_SENTENCE_CEILING: Record<MomentumBand, number> = {
  GUARDED: 2,
  CURIOUS: 3,
  ENGAGED: 6,
  COMMITTED: 6,
};

const OPENNESS_DIRECTIVE: Record<MomentumBand, string> = {
  GUARDED:
    "OPENNESS: You are not feeling this conversation. Keep it short and a little cool. Answer " +
    "what is asked and no more. Do not hand over specifics or stories - they have not earned it.",
  CURIOUS:
    "OPENNESS: You are mildly engaged. Answer real questions, give a bit of detail, but stay " +
    "measured. You are still deciding whether this is worth your time.",
  ENGAGED:
    "OPENNESS: This person has actually been listening. Loosen up - give the specifics, name " +
    "the consequence, and if a real story comes to mind you can tell it.",
  COMMITTED:
    "OPENNESS: You trust this conversation now. Be candid and concrete, and follow your own " +
    "train of thought where it goes.",
};

export function getRevealBudget(phase: string, band: MomentumBand): RevealBudget {
  const phaseBudget = getLengthBudget(phase);
  const ceiling = BAND_SENTENCE_CEILING[band] ?? 2;

  const maxSentences = Math.min(phaseBudget.maxSentences, ceiling);
  const lengthBudget: LengthBudget = {
    minSentences: Math.min(phaseBudget.minSentences, maxSentences),
    maxSentences,
  };

  let ventDepth: VentDepth = "none";
  if (PAIN_PHASES.has(phase)) {
    if (band === "ENGAGED" || band === "COMMITTED") ventDepth = "war_story";
    else if (band === "CURIOUS") ventDepth = "brief";
  }

  const ventLine =
    ventDepth === "war_story"
      ? " If the moment genuinely calls for it, a short war story is welcome."
      : ventDepth === "brief"
        ? " A brief, real gripe is fine; hold the longer stories back."
        : "";

  return {
    lengthBudget,
    ventDepth,
    opennessDirective: OPENNESS_DIRECTIVE[band] + ventLine,
  };
}
