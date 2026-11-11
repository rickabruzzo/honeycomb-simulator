/**
 * On-demand AI review of a finished session, for admins.
 *
 * Different job from the judge (lib/scoring/judge.ts): the judge produces the trainee's score.
 * This reviews the WHOLE run - was the simulated attendee realistic, was the score fair, and what
 * should the trainee hear - so an admin can spot simulator glitches (loops, ignored offers) and
 * grading that missed, then save the useful part as a trainer note.
 */

import type { SessionState } from "../storage";
import type { ScoreRecord } from "../scoring";

export const SESSION_REVIEW_SYSTEM_PROMPT = `
You review recorded practice sessions from Honeycomb's booth-conversation simulator for the
program admin. A trainee (booth staffer) talks to a SIMULATED conference attendee; an automated
judge then scores the trainee 0-10 on six dimensions (discovery, listening, empathy,
qualification, guardrails, handoff). Booth conversations are 3-5 minutes; a competent one
scores around 6-7 per dimension.

Write a short, plain-text review in exactly these three sections, using these headings:

SIMULATOR QUALITY
Did the attendee behave like a real conference attendee? Name specific glitches with the line
they happened on: ignoring the trainee's offer or question, repeating an earlier line, answering a
previous question late, off-topic replies, an outcome that was reached but not recognized. Say
"No issues" if there were none.

SCORING FAIRNESS
Was the score fair given what actually happened (and given any simulator glitches above)? For
each dimension you would change, give the current score, the score you'd give, and one line why.
Say "Score looks fair" if you would not change anything.

COACHING FOR THE TRAINEE
2-4 bullet points, written to the trainee: what to keep doing and the single highest-value
change, each tied to something said in the transcript.

Rules: quote the transcript when you point at something; be concrete and brief; never invent
lines that aren't in the transcript; no preamble or sign-off.
`.trim();

export function buildSessionReviewMessage(
  session: SessionState,
  score: ScoreRecord | null,
  focus?: string
): string {
  const lines: string[] = [];

  lines.push("HIDDEN ATTENDEE PROFILE (the trainee could not see this):");
  lines.push(session.kickoff?.attendeeProfile || "(none provided)");
  lines.push("");

  if (score) {
    lines.push(`CURRENT SCORE: ${score.score}/100 (${score.grade}) via ${score.scoringMethod}`);
    for (const [dim, val] of Object.entries(score.breakdown)) {
      const ev = score.evidence?.find((e) => e.dimension === dim);
      lines.push(`- ${dim}: ${val}/10${ev?.comment ? ` - judge said: ${ev.comment}` : ""}`);
    }
    if (score.summary) lines.push(`Judge summary: ${score.summary}`);
  } else {
    lines.push("CURRENT SCORE: not scored");
  }
  if (session.violations?.length) {
    lines.push(`RULE-CHECK FLAGS: ${session.violations.join("; ")}`);
  }
  const outcome = session.pendingOutcome ?? session.detectedOutcome?.type;
  if (outcome) lines.push(`DETECTED OUTCOME: ${outcome}`);
  lines.push("");

  lines.push("TRANSCRIPT (with seconds since the previous line; ~0s attendee replies came from canned templates, not the model):");
  let prev: number | null = null;
  for (const m of session.transcript) {
    if (m.type === "system" && /SESSION FEEDBACK/.test(m.text)) continue;
    const t = Date.parse(m.timestamp);
    const gap = prev !== null && !Number.isNaN(t) ? Math.max(0, (t - prev) / 1000) : null;
    if (!Number.isNaN(t)) prev = t;
    const role = m.type === "trainee" ? "Trainee" : m.type === "attendee" ? "Attendee" : "System";
    lines.push(`${gap !== null ? `[+${gap.toFixed(1)}s] ` : ""}${role}: ${m.text}`);
  }

  if (focus && focus.trim()) {
    lines.push("");
    lines.push(`ADMIN'S QUESTION / FOCUS (address this directly): ${focus.trim().slice(0, 2000)}`);
  }

  return lines.join("\n");
}
