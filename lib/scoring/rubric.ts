/**
 * The scoring rubric: anchored 0-5 scales per dimension and the judge's system prompt.
 *
 * Kept as data, separate from judge logic, so the anchors can be tuned against SME feedback
 * without a code change. Versioned for the same reason.
 */

import type { SessionState } from "../storage";
import { getTraineeMessages } from "../scoringInput";

export const RUBRIC_VERSION = "score-rubric-v1";

/** The five dimensions, in the order the judge must return them. */
export const SCORING_DIMENSIONS = [
  "listening",
  "discovery",
  "empathy",
  "otel_assumptions",
  "guardrails",
] as const;

export type ScoringDimension = (typeof SCORING_DIMENSIONS)[number];

const ANCHORS = `
LISTENING - did the trainee actually hear the attendee?
0: Ignores answers; repeats questions already answered.
1: Asks mostly scripted questions unrelated to what was said.
2: Acknowledges answers but misses the signal in them.
3: Generally follows up on what the attendee actually said.
4: Reflects the attendee's point in their own terms and probes it.
5: Reflects and adapts the line of questioning to what was heard, without parroting.
Note: reflection does NOT require set phrases. "It can feel like you're starting over each
time" is a 4-5 reflection even though it contains no "sounds like".

DISCOVERY - did questions uncover the real situation?
0: No discovery; pitches or talks at the attendee.
1: Surface questions only; learns nothing usable.
2: Learns role OR tooling, but not pain or impact.
3: Uncovers role and tooling and at least one real pain.
4: Uncovers pain AND its impact in the attendee's own words.
5: Builds a full picture - role, tooling, pain, impact, and what a better state looks like.
Note: score the INFORMATION uncovered, never the number of questions asked.

EMPATHY - did validation fit this persona?
0: Dismissive or transactional.
1: Generic pleasantries with no connection to what was said.
2: Some acknowledgement but mistimed or mismatched to the persona.
3: Appropriate acknowledgement of the attendee's situation.
4: Validation that fits the persona (business impact for a buyer, frustration for an IC).
5: Well-timed, specific validation that visibly opens the attendee up.

OTEL_ASSUMPTIONS - did the trainee gauge OpenTelemetry maturity rather than assume it?
0: Asserts the attendee's OTel state incorrectly and builds on the wrong assumption.
2: Assumes OTel maturity without checking, but it happens to fit.
3: Neutral; neither assumes nor probes.
4: Asks about OTel status before relying on it.
5: Asks, and adapts the conversation to the actual maturity level.
Note: judge against the attendee's ACTUAL hidden familiarity, provided below.

GUARDRAILS - restraint and honesty.
0: Early pitch, jargon dump, over-promising, or bluffing deep technical answers.
2: Some premature pitching or unearned product talk.
3: Mostly restrained; minor slips.
4: Stays high-level, avoids jargon, pitches only after pain and relevance are established.
5: Textbook restraint, and escalates deep technical questions instead of bluffing.
`.trim();

export const JUDGE_SYSTEM_PROMPT = `
You are an expert sales-coaching evaluator for Honeycomb booth-conversation training. You
score how the TRAINEE (the booth staffer) conducted a discovery conversation with a simulated
conference attendee. Score only the trainee's behavior; the attendee's lines are context.

Score each of five dimensions from 0 to 5 using these anchors:

${ANCHORS}

Rules:
- Base every score on what the trainee actually did. Do not reward product knowledge that did
  not help the conversation.
- Evidence is required. For each dimension, quote the trainee's own words (verbatim) that
  justify the score. If you cannot quote evidence for a score above 3, the score must be 3 or
  lower. Empty evidence with a high score is not allowed.
- LLMs tend to over-praise. Anchor 4 and 5 are demanding; most competent-but-ordinary
  conversations sit at 3.
- Reflection and empathy are about intent and fit, never about specific phrases.

Return ONLY a JSON object, no prose, in exactly this shape:
{
  "listening":        { "score": <0-5>, "rationale": "<one line>", "evidence": "<verbatim trainee quote or \\"\\">" },
  "discovery":        { "score": <0-5>, "rationale": "<one line>", "evidence": "<verbatim trainee quote or \\"\\">" },
  "empathy":          { "score": <0-5>, "rationale": "<one line>", "evidence": "<verbatim trainee quote or \\"\\">" },
  "otel_assumptions": { "score": <0-5>, "rationale": "<one line>", "evidence": "<verbatim trainee quote or \\"\\">" },
  "guardrails":       { "score": <0-5>, "rationale": "<one line>", "evidence": "<verbatim trainee quote or \\"\\">" },
  "summary": "<1-2 sentence overall read>"
}
`.trim();

/**
 * Render the transcript and hidden context the judge scores against. The hidden profile is
 * included so the judge can assess OTel-assumption accuracy and persona fit.
 */
export function buildJudgeUserMessage(session: SessionState): string {
  const lines: string[] = [];

  lines.push("HIDDEN ATTENDEE PROFILE (the trainee could not see this):");
  lines.push(session.kickoff.attendeeProfile || "(none provided)");
  lines.push("");

  const detected = session.detectedOutcome?.type;
  if (detected) lines.push(`DETECTED OUTCOME: ${detected}`);
  lines.push("");

  lines.push("TRANSCRIPT (score the Trainee turns only):");
  for (const m of session.transcript) {
    if (m.type === "system") continue;
    const role = m.type === "trainee" ? "Trainee" : "Attendee";
    lines.push(`${role}: ${m.text}`);
  }

  return lines.join("\n");
}

/** True when the trainee said anything at all - a guard against scoring an empty session. */
export function hasTraineeContent(session: SessionState): boolean {
  return getTraineeMessages(session.transcript).length > 0;
}
