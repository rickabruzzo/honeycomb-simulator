/**
 * Training-wheels progressive reveal.
 *
 * When a session is run in training-wheels (guided) mode, the trainee sees the attendee's hidden
 * attributes surface as the conversation deepens — a turn-based ladder, with an early unlock when
 * the attendee actually voices a pain:
 *   - role      → a couple of exchanges in (genuinely into discovery)
 *   - pains     → as soon as the attendee voices one (keyword match), else by ~4 exchanges
 *   - the rest  → posture / tooling lean / OTel familiarity, once pain is on the table and there's depth
 *
 * Two triggers were rejected after live testing: the momentum band barely moves (good discovery
 * still reads GUARDED, so it would stay stuck on "nothing yet"), and keyword-match ALONE misses
 * pains the attendee paraphrases ("correlating logs, eyeballing timestamps" never hits "root
 * cause"). The turn ladder guarantees the panel progresses as the trainee engages; the keyword
 * early-unlock rewards genuinely drawing a pain out.
 */
import type { SessionState } from "../storage";

export interface RevealedAttributes {
  role?: string;
  pains?: string[];
  posture?: string;
  tooling?: string;
  otel?: string;
}

/**
 * Attributes the trainee has earned visibility into, based on what the attendee has actually
 * disclosed so far. Returns null when training wheels is off (the caller reveals nothing).
 */
export function computeRevealed(session: SessionState): RevealedAttributes | null {
  if (!session.trainingWheels) return null;

  const persona = session.persona;
  if (!persona) return {};

  const attendeeText = session.transcript
    .filter((m) => m.type === "attendee")
    .map((m) => m.text.toLowerCase())
    .join(" \n ");
  const traineeTurns = session.transcript.filter((m) => m.type === "trainee").length;

  const revealed: RevealedAttributes = {};

  // Role: surfaced once the trainee is actually in discovery (past the opening pleasantries).
  if (traineeTurns >= 2) revealed.role = persona.personaType;

  // Pains: early-unlock any primary pain the attendee has actually voiced (keyword hit); by ~4
  // exchanges, reveal the primary pains regardless so the panel reliably progresses.
  const primaryPains = (persona.painAnchors ?? []).filter((a) => a.priority === "primary");
  const keywordHits = primaryPains
    .filter((a) => a.keywords.some((k) => attendeeText.includes(k.toLowerCase())))
    .map((a) => a.pain);
  const pains = traineeTurns >= 4 ? primaryPains.map((a) => a.pain) : keywordHits;
  if (pains.length) revealed.pains = pains;

  // Deeper read: only once pain is on the table and the conversation has real depth.
  if (pains.length && traineeTurns >= 6) {
    revealed.posture = persona.emotionalPosture;
    revealed.tooling = persona.toolingBias;
    revealed.otel = persona.otelFamiliarity;
  }

  return revealed;
}
