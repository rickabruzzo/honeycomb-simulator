/**
 * The scoring rubric: anchored 0-5 scales per dimension and the judge's system prompt.
 *
 * Kept as data, separate from judge logic, so the anchors can be tuned against SME feedback
 * without a code change. Versioned for the same reason.
 */

import type { SessionState } from "../storage";
import { getTraineeMessages } from "../scoringInput";

export const RUBRIC_VERSION = "score-rubric-v3";

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
Each dimension is scored 0-10. Anchors are given at even points; use the odd values in between
when a conversation sits between two anchors. Most competent-but-ordinary turns land around 5-6;
8-10 is demanding and must be earned with quotable evidence.

DISCOVERY - did questions uncover the real situation?
0: No discovery; pitches or talks at the attendee.
2: Surface questions only; learns little usable (maybe a role OR a tool).
4: Uncovers role and tooling and at least one real pain.
6: Uncovers pain AND its impact in the attendee's own words.
8: Also draws out the attendee's IDEAL FUTURE STATE - what "better" looks like to them.
10: Full, vivid picture - role, tooling, pain, quantified impact, future state, and constraints - drawn out naturally.
Note: score the INFORMATION uncovered, never the number of questions asked.
Note: asserting the attendee's OpenTelemetry maturity without checking caps this at 4 - discovery
built on an unverified assumption. Judge OTel accuracy against the attendee's ACTUAL hidden
familiarity, provided below.

LISTENING - did the trainee actually hear the attendee?
0: Ignores answers; repeats questions already answered.
2: Mostly scripted; acknowledges answers but misses the signal in them.
4: Generally follows up on what the attendee actually said.
6: Reflects the attendee's point in their own terms and probes it.
8: Adapts the line of questioning to what was heard, without parroting.
10: Consistently builds each turn on the last; the attendee visibly feels heard throughout.
Note: reflection does NOT require set phrases. "It can feel like you're starting over each time"
is strong reflection even though it contains no "sounds like".

EMPATHY - did validation fit this persona?
0: Dismissive or transactional.
2: Generic pleasantries with no connection to what was said.
4: Appropriate acknowledgement of the attendee's situation.
6: Validation that fits the persona (business impact for a buyer, operational frustration for an IC).
8: Well-timed, specific validation that visibly opens the attendee up.
10: Sustained, accurate read of what matters to them; validation lands throughout.
Note: judge the BALANCE across the conversation. Several genuine, well-fit acknowledgments with ONE
mistimed or slightly-off line is still a 6 - do NOT drag the whole dimension down for a single
imperfect validation. Reserve 4 or below for validation that is mostly generic, absent, or
repeatedly mismatched.

QUALIFICATION - did the trainee reach the right read on fit, need, and authority?
0: Never gauges fit; treats everyone identically regardless of the signals in front of them.
2: Surface only; learns a title but not need, authority, or fit.
4: Gauges need or fit and reaches a defensible read.
6: Establishes need and fit and acts consistently with that read.
8: Establishes need, fit, AND authority (for a buyer) and adapts the approach to it.
10: Accurate read including budget/authority and next-step routing; correctly disqualifies a non-fit when that is the truth.
Note: engaging on NUMBERS - budget, current spend, contract, pricing comparisons - or looping in
the person who owns the numbers is a strong AUTHORITY/buying signal ("no one talks numbers unless
they're in charge of numbers"). Credit it toward authority and read the attendee as sales-qualified.
Note: correctly concluding a non-fit is a non-fit is a top score, not a failure.

GUARDRAILS - restraint and honesty.
0: Unprompted early pitch, jargon dump, over-promising, or bluffing deep technical answers.
2: Noticeable unprompted product talk before need and relevance are established.
4: Mostly restrained; minor slips.
6: Restrained; stays high-level and largely avoids jargon.
8: Pitches or handles product only after pain and relevance are clear, OR in direct answer to the attendee; escalates deep questions instead of bluffing.
10: Textbook restraint and honesty throughout.
Note (critical): ANSWERING the attendee's OWN direct question - about pricing, cost, product
capability, or how it works - is NOT a violation and must NOT be scored as an "early pitch," even
late in the conversation. The guardrail is for UNPROMPTED pitching before need is established. Do
not deduct for responsive, on-topic answers to questions the attendee raised, and do not claim need
was unvalidated when the transcript shows it was.

HANDOFF - did the trainee secure the RIGHT next step for the read they reached?
First decide the correct outcome FROM THE CONVERSATION, then score how well the trainee secured it.
Do NOT assume the DETECTED OUTCOME label below is correct - judge against the read the transcript
actually supports. The four outcomes and who each fits:
  - DEMO handoff (pass to a demo engineer): fits ANYONE showing genuine interest - a safe, broadly good next step.
  - BADGE SCAN (sales follow-up / MQL): for someone who manages teams or budgets, can move the needle, or wants to set up a team demo - i.e. authority is present.
  - POSTCARD (self-service: white papers, content, free tier): for a self-starter IC WITHOUT budget or leadership authority who trusts content over sales. This is the BEST outcome for a skeptical attendee - never a lesser result.
  - POLITE EXIT: should be RARE, and fits any persona. It is a WIN only when there was genuinely no path to one of the outcomes above (the lift is too high, they're happy as-is, or they refuse to see the value). It is a MISS when a better outcome was clearly on the table and the trainee settled or gave up.
Engaging on budget/numbers, or looping in the person who owns the numbers, points to BADGE SCAN, not a postcard.
0: No next step, or forces a clearly wrong one (badge scan on someone with no authority or interest; postcard pushed on a budget-holding buyer who wanted to talk).
4: A next step exists but is mismatched to who the attendee is (e.g. a polite exit when a badge scan was clearly available).
6: A correctly-matched next step, loosely set up.
8: The right next step for the read, clearly set up and easy to action.
10: The right next step, set up so the follow-up (or exit) is genuinely easy and correct, with ownership and timing nailed down.
Note: matching a postcard to a skeptical, self-directed IC scores as high as a badge scan does for
a qualified buyer. A correct polite exit (no better path existed) is a win, never a "lost" outcome.
`.trim();

export const JUDGE_SYSTEM_PROMPT = `
You are an expert sales-coaching evaluator for Honeycomb booth-conversation training. You
score how the TRAINEE (the booth staffer) conducted a discovery conversation with a simulated
conference attendee. Score only the trainee's behavior; the attendee's lines are context.

Score each of six dimensions from 0 to 10 using these anchors:

${ANCHORS}

Rules:
- Base every score on what the trainee actually did. Do not reward product knowledge that did
  not help the conversation.
- Evidence is required. For each dimension, quote the trainee's own words (verbatim) that
  justify the score. If you cannot quote evidence for a score above 6, the score must be 6 or
  lower. Empty evidence with a high score is not allowed.
- LLMs tend to over-praise. Anchors 8-10 are demanding; most competent-but-ordinary conversations
  sit around 5-6.
- Reflection and empathy are about intent and fit, never about specific phrases.
- The rationale MUST name the GAP: state briefly what the trainee would need to do to reach the
  next level up. Do not just describe what happened - explain what held the score where it is.

Return ONLY a JSON object, no prose, in exactly this shape:
{
  "discovery":     { "score": <0-10>, "rationale": "<one line incl. what would earn the next level>", "evidence": "<verbatim trainee quote or \\"\\">" },
  "listening":     { "score": <0-10>, "rationale": "<one line incl. what would earn the next level>", "evidence": "<verbatim trainee quote or \\"\\">" },
  "empathy":       { "score": <0-10>, "rationale": "<one line incl. what would earn the next level>", "evidence": "<verbatim trainee quote or \\"\\">" },
  "qualification": { "score": <0-10>, "rationale": "<one line incl. what would earn the next level>", "evidence": "<verbatim trainee quote or \\"\\">" },
  "guardrails":    { "score": <0-10>, "rationale": "<one line incl. what would earn the next level>", "evidence": "<verbatim trainee quote or \\"\\">" },
  "handoff":       { "score": <0-10>, "rationale": "<one line incl. what would earn the next level>", "evidence": "<verbatim trainee quote or \\"\\">" },
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
