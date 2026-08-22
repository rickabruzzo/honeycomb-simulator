/**
 * The scoring rubric: anchored 0-5 scales per dimension and the judge's system prompt.
 *
 * Kept as data, separate from judge logic, so the anchors can be tuned against SME feedback
 * without a code change. Versioned for the same reason.
 */

import type { SessionState } from "../storage";
import { getTraineeMessages } from "../scoringInput";

export const RUBRIC_VERSION = "score-rubric-v2";

/** The six booth-arc dimensions, in the order the judge must return them. */
export const SCORING_DIMENSIONS = [
  "discovery",
  "listening",
  "empathy",
  "qualification",
  "guardrails",
  "handoff",
] as const;

export type ScoringDimension = (typeof SCORING_DIMENSIONS)[number];

const ANCHORS = `
DISCOVERY - did questions uncover the real situation?
0: No discovery; pitches or talks at the attendee.
1: Surface questions only; learns nothing usable.
2: Learns role OR tooling, but not pain or impact.
3: Uncovers role and tooling and at least one real pain.
4: Uncovers pain AND its impact in the attendee's own words.
5: Builds a full picture - role, tooling, pain, impact, and what a better state looks like.
Note: score the INFORMATION uncovered, never the number of questions asked.
Note: assuming or asserting the attendee's OpenTelemetry maturity without checking caps this
at 2 - discovery built on an unverified assumption. Judge OTel accuracy against the attendee's
ACTUAL hidden familiarity, provided below.

LISTENING - did the trainee actually hear the attendee?
0: Ignores answers; repeats questions already answered.
1: Asks mostly scripted questions unrelated to what was said.
2: Acknowledges answers but misses the signal in them.
3: Generally follows up on what the attendee actually said.
4: Reflects the attendee's point in their own terms and probes it.
5: Reflects and adapts the line of questioning to what was heard, without parroting.
Note: reflection does NOT require set phrases. "It can feel like you're starting over each
time" is a 4-5 reflection even though it contains no "sounds like".

EMPATHY - did validation fit this persona?
0: Dismissive or transactional.
1: Generic pleasantries with no connection to what was said.
2: Some acknowledgement but mistimed or mismatched to the persona.
3: Appropriate acknowledgement of the attendee's situation.
4: Validation that fits the persona (business impact for a buyer, frustration for an IC).
5: Well-timed, specific validation that visibly opens the attendee up.

QUALIFICATION - did the trainee reach the right read on the opportunity (fit, need, authority)?
0: Never attempts to gauge fit; treats everyone as a hot lead (or a waste of time) regardless.
2: Surface qualification; learns a title but not need, authority, or fit.
3: Gauges need or fit and reaches a defensible read.
4: Establishes need and fit (and, for a buyer, authority) and acts consistently with that read.
5: Reaches an accurate read INCLUDING correctly disqualifying a non-fit, and adapts to it.
Note: correctly concluding a non-fit is a non-fit is a 5, not a failure.

GUARDRAILS - restraint and honesty.
0: Early pitch, jargon dump, over-promising, or bluffing deep technical answers.
2: Some premature pitching or unearned product talk.
3: Mostly restrained; minor slips.
4: Stays high-level, avoids jargon, pitches only after pain and relevance are established.
5: Textbook restraint, and escalates deep technical questions instead of bluffing.

HANDOFF - did the trainee secure the right next step for the read they reached?
0: No next step, or forces an inappropriate one (badge scan on a hard non-fit; MQL with no discovery).
2: A next step exists but is mistimed or mismatched to the qualification read.
3: A reasonable next step, loosely set up.
4: The appropriate next step for the read - earned MQL / badge scan, or a clean polite exit for
a disqualified attendee - clearly set up.
5: The right next step, set up so the follow-up (or the exit) is genuinely easy and correct.
Note: a correct disqualification is a 4-5, never penalized as a "lost" outcome. Judge the next
step against the detected outcome, provided below.
`.trim();

export const JUDGE_SYSTEM_PROMPT = `
You are an expert sales-coaching evaluator for Honeycomb booth-conversation training. You
score how the TRAINEE (the booth staffer) conducted a discovery conversation with a simulated
conference attendee. Score only the trainee's behavior; the attendee's lines are context.

Score each of six dimensions from 0 to 5 using these anchors:

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
  "discovery":     { "score": <0-5>, "rationale": "<one line>", "evidence": "<verbatim trainee quote or \\"\\">" },
  "listening":     { "score": <0-5>, "rationale": "<one line>", "evidence": "<verbatim trainee quote or \\"\\">" },
  "empathy":       { "score": <0-5>, "rationale": "<one line>", "evidence": "<verbatim trainee quote or \\"\\">" },
  "qualification": { "score": <0-5>, "rationale": "<one line>", "evidence": "<verbatim trainee quote or \\"\\">" },
  "guardrails":    { "score": <0-5>, "rationale": "<one line>", "evidence": "<verbatim trainee quote or \\"\\">" },
  "handoff":       { "score": <0-5>, "rationale": "<one line>", "evidence": "<verbatim trainee quote or \\"\\">" },
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
