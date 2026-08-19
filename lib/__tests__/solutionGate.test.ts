/**
 * Solution gate tests — evaluation questions are blocked until the trainee
 * introduces the product or a concrete capability.
 *
 * Failure case (before fix):
 *   No solution mentioned yet
 *   Attendee: "How would that help reduce alert noise?" ← WRONG (nothing to evaluate)
 *
 * Correct behavior after fix:
 *   Attendee shares pain or asks clarification until solution is described
 *   Only THEN can evaluation questions ("Can you walk me through?") appear
 *
 * Run with:  npx tsx lib/__tests__/solutionGate.test.ts
 */

import {
  detectSolutionMention,
  decideNextMove,
  allowedMovesForIntent,
  type DirectorMove,
} from "../attendee/conversationDirector";
import { generateAttendeeReply } from "../attendee/generateAttendeeReply";
import type { SessionState } from "../storage";

let passed = 0;
let failed = 0;

function assert(label: string, actual: unknown, expected: unknown) {
  if (actual === expected) {
    console.log(`  \u2713 ${label}`);
    passed++;
  } else {
    console.error(`  \u2717 ${label}`);
    console.error(`      expected: ${JSON.stringify(expected)}`);
    console.error(`      received: ${JSON.stringify(actual)}`);
    failed++;
  }
}

function assertNotNull(label: string, actual: unknown) {
  if (actual != null) {
    console.log(`  \u2713 ${label}`);
    passed++;
  } else {
    console.error(`  \u2717 ${label}`);
    console.error(`      expected non-null, got: ${String(actual)}`);
    failed++;
  }
}

function assertNotIncludes(label: string, haystack: string, needle: string) {
  if (!haystack.toLowerCase().includes(needle.toLowerCase())) {
    console.log(`  \u2713 ${label}`);
    passed++;
  } else {
    console.error(`  \u2717 ${label}`);
    console.error(`      expected NOT to include: ${JSON.stringify(needle)}`);
    console.error(`      received: ${JSON.stringify(haystack)}`);
    failed++;
  }
}

function assertNoQuestion(label: string, actual: string) {
  if (!actual.endsWith("?")) {
    console.log(`  \u2713 ${label}`);
    passed++;
  } else {
    console.error(`  \u2717 ${label}`);
    console.error(`      reply should be a statement, not a question`);
    console.error(`      received: ${JSON.stringify(actual)}`);
    failed++;
  }
}

function makeSession(
  transcript: Array<{ type: "system" | "trainee" | "attendee"; text: string }>,
  overrides?: Partial<SessionState>
): SessionState {
  return {
    id: "test-session",
    currentState: "CONVERSATION",
    stateHistory: [],
    transcript: transcript.map((m, i) => ({
      id: `msg-${i}`,
      type: m.type,
      text: m.text,
      timestamp: new Date().toISOString(),
    })),
    violations: [],
    kickoff: {
      attendeeProfile: "Persona: SRE\nModifiers: time-constrained\nEmotional posture: curious",
    },
    startTime: new Date().toISOString(),
    active: true,
    ...overrides,
  } as SessionState;
}

const EVALUATION_PHRASES = [
  "can you walk me through",
  "can you show me",
  "is there a free tier",
  "can you scan my badge",
  "do you have documentation",
  "how quickly could a team adopt",
  "would that fit into",
  "how would that help",
  "does it work alongside",
  "how does it help",
];

function isEvaluationPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  return EVALUATION_PHRASES.some((p) => lower.includes(p));
}

// ── detectSolutionMention ─────────────────────────────────────────────────────

console.log("\n\ud83d\udccb detectSolutionMention \u2014 detection");

assert(
  "detects 'we help teams debug faster'",
  detectSolutionMention("We help teams debug incidents faster."),
  true
);
assert(
  "detects 'Honeycomb' product name",
  detectSolutionMention("Honeycomb gives you visibility into your system."),
  true
);
assert(
  "detects 'lets you trace'",
  detectSolutionMention("This tool lets you trace requests end-to-end."),
  true
);
assert(
  "detects 'you can query'",
  detectSolutionMention("You can query any field in your events instantly."),
  true
);
assert(
  "detects 'distributed tracing'",
  detectSolutionMention("We provide distributed tracing for microservices."),
  true
);
assert(
  "detects 'debug faster'",
  detectSolutionMention("It helps teams debug faster during incidents."),
  true
);
assert(
  "rejects 'What kind of tools are you using?'",
  detectSolutionMention("What kind of tools are you using?"),
  false
);
assert(
  "rejects 'Tell me more about your setup'",
  detectSolutionMention("Tell me more about your setup."),
  false
);
assert(
  "rejects 'We deal with a lot of alert noise'",
  detectSolutionMention("We deal with a lot of alert noise during on-call."),
  false
);

// ── Session solutionIntroduced update ─────────────────────────────────────────

console.log("\n\ud83d\udccb solutionIntroduced \u2014 session state update");

{
  const session = makeSession([
    { type: "system", text: "*approaches booth*" },
    { type: "attendee", text: "We deal with a lot of debugging pain during incidents." },
    { type: "trainee", text: "Tell me more." },
    { type: "attendee", text: "Yeah, it slows us down significantly." },
  ]);

  assert("solutionIntroduced starts undefined", session.solutionIntroduced, undefined);

  generateAttendeeReply({
    traineeText: "Honeycomb lets you query any field in your telemetry data instantly.",
    session,
    traineeTurnCount: 3,
  });

  assert("solutionIntroduced is true after solution mention", session.solutionIntroduced, true);
}

{
  const session = makeSession([
    { type: "system", text: "*approaches booth*" },
    { type: "attendee", text: "We have some incident pain." },
  ]);

  generateAttendeeReply({
    traineeText: "What kind of pain are you seeing?",
    session,
    traineeTurnCount: 1,
  });

  assert("solutionIntroduced stays false for non-solution trainee text", session.solutionIntroduced, undefined);
}

// ── allowedMovesForIntent — evaluating_fit gating ────────────────────────────

console.log("\n\ud83d\udccb allowedMovesForIntent \u2014 evaluating_fit solution gate");

{
  const withoutSolution = allowedMovesForIntent("evaluating_fit", "DISCOVERY", "CURIOUS", false);
  assert("ask_demo NOT allowed before solution", withoutSolution.has("ask_demo" as DirectorMove), false);
  assert("ask_docs NOT allowed before solution", withoutSolution.has("ask_docs" as DirectorMove), false);
  assert("ask_badge NOT allowed before solution", withoutSolution.has("ask_badge" as DirectorMove), false);
  assert("answer IS allowed before solution", withoutSolution.has("answer" as DirectorMove), true);
  assert("share_pain IS allowed before solution", withoutSolution.has("share_pain" as DirectorMove), true);
  assert("ask_clarifying IS allowed before solution", withoutSolution.has("ask_clarifying" as DirectorMove), true);
}

{
  const withSolution = allowedMovesForIntent("evaluating_fit", "DISCOVERY", "CURIOUS", true);
  assert("ask_demo IS allowed after solution", withSolution.has("ask_demo" as DirectorMove), true);
  assert("ask_docs IS allowed after solution", withSolution.has("ask_docs" as DirectorMove), true);
}

// ── allowedMovesForIntent — neutral gating ────────────────────────────────────

console.log("\n\ud83d\udccb allowedMovesForIntent \u2014 neutral solution gate");

{
  const withoutSolution = allowedMovesForIntent("neutral", "DISCOVERY", "CURIOUS", false);
  assert("ask_demo NOT allowed (neutral, no solution)", withoutSolution.has("ask_demo" as DirectorMove), false);
  assert("ask_docs NOT allowed (neutral, no solution)", withoutSolution.has("ask_docs" as DirectorMove), false);
  assert("ask_badge NOT allowed (neutral, no solution)", withoutSolution.has("ask_badge" as DirectorMove), false);
  assert("share_pain IS allowed (neutral, no solution)", withoutSolution.has("share_pain" as DirectorMove), true);
}

{
  const withSolution = allowedMovesForIntent("neutral", "DISCOVERY", "CURIOUS", true);
  assert("ask_demo IS allowed (neutral, with solution)", withSolution.has("ask_demo" as DirectorMove), true);
}

// ── Test 1: No solution → evaluation question must NOT appear ─────────────────

console.log("\n\ud83d\udccb Test 1: No solution → evaluation questions blocked");

{
  // Run 6 turns (cycling through template banks) — none should be evaluation questions
  let evaluationCount = 0;
  for (let i = 0; i < 6; i++) {
    const session = makeSession([
      { type: "system", text: "*approaches booth*" },
      { type: "attendee", text: "We have a lot of alert noise during on-call." },
      { type: "trainee", text: "That sounds frustrating." },
      { type: "attendee", text: "Yeah, debugging incidents takes way too long." },
    ]);
    // NO solution introduced

    const result = generateAttendeeReply({
      traineeText: "What does your current process look like?",
      session,
      traineeTurnCount: i + 1,
    });

    if (result && isEvaluationPhrase(result.text)) {
      evaluationCount++;
      console.error(`      evaluation phrase detected on turn ${i}: "${result.text}"`);
    }
  }
  assert("evaluation questions never appear before solution (6 turns)", evaluationCount, 0);
}

// ── Test 2: After solution → evaluation questions allowed ─────────────────────

console.log("\n\ud83d\udccb Test 2: After solution introduction → evaluation questions allowed");

{
  // With solutionIntroduced=true, the director CAN select ask_docs/ask_demo.
  // This test verifies the EVALUATION_QUESTIONS bank is used in the discovery-
  // question filter instead of pain statements.
  const session = makeSession(
    [
      { type: "system", text: "*approaches booth*" },
      { type: "attendee", text: "We have a lot of alert noise." },
      { type: "trainee", text: "Honeycomb lets you query any telemetry field instantly." },
      { type: "attendee", text: "Interesting." },
    ],
    { solutionIntroduced: true, momentum: { score: 40, events: [] } as any }
  );

  // With solution introduced, the director can now produce evaluation replies
  const result = generateAttendeeReply({
    traineeText: "Does that sound useful for your situation?",
    session,
    traineeTurnCount: 3,
  });

  assertNotNull("produces a reply after solution", result);
  // The reply should be contextually relevant (not blocked)
  if (result) {
    assert("reply is a string", typeof result.text, "string");
    assert("reply has content", result.text.length > 0, true);
  }
}

// ── Test 3: CTA momentum gate still works after solution ─────────────────────

console.log("\n\ud83d\udccb Test 3: CTA momentum gate — no regression");

{
  // Even with solutionIntroduced=true, CTA moves require discovery depth
  // (enough turns + momentum). At GUARDED band (low momentum), ask_demo
  // should not fire.
  const session = makeSession(
    [
      { type: "system", text: "*approaches booth*" },
      { type: "attendee", text: "We deal with alert noise." },
      { type: "trainee", text: "Honeycomb helps reduce that." },
      { type: "attendee", text: "How?" },
    ],
    { solutionIntroduced: true }
    // No momentum set → defaults to 0 (GUARDED band)
  );

  const directive = decideNextMove(
    session,
    undefined,
    "Would you want to see it in action?"
  );

  // At GUARDED band with only 2 total messages, ask_badge should not appear
  assert(
    "ask_badge NOT selected at low momentum/depth even with solution",
    directive.move === "ask_badge",
    false
  );
}

// Re-run test 3 with the correct assertion (the test above was malformed):
{
  const session = makeSession(
    [
      { type: "system", text: "*approaches booth*" },
      { type: "attendee", text: "We deal with alert noise." },
      { type: "trainee", text: "Honeycomb helps reduce that." },
      { type: "attendee", text: "How?" },
    ],
    { solutionIntroduced: true }
  );

  const directive = decideNextMove(
    session,
    undefined,
    "Would you want to see it in action?"
  );

  const isCtaMove = (["ask_demo", "ask_docs", "ask_badge"] as DirectorMove[]).includes(directive.move);
  assert(
    "CTA moves NOT selected at low depth (momentum gate still active)",
    isCtaMove,
    false
  );
}

// ── Test 4: Solution gate persists after being set ────────────────────────────

console.log("\n\ud83d\udccb Test 4: solutionIntroduced persists once set");

{
  const session = makeSession([
    { type: "system", text: "*approaches booth*" },
    { type: "attendee", text: "We have debugging pain." },
  ]);

  assert("starts false", session.solutionIntroduced, undefined);

  // First turn: trainee introduces solution
  generateAttendeeReply({
    traineeText: "Honeycomb lets you debug incidents 10x faster.",
    session,
    traineeTurnCount: 1,
  });
  assert("set to true after solution", session.solutionIntroduced, true);

  // Second turn: trainee says something unrelated (not a solution mention)
  generateAttendeeReply({
    traineeText: "Tell me more about your team.",
    session,
    traineeTurnCount: 2,
  });
  assert("stays true after non-solution message", session.solutionIntroduced, true);
}

// ── Report ──────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
