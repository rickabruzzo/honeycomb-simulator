/**
 * Answer contract tests — ensures the "answer" move always directly answers
 * the trainee's question instead of reverting to generic or unrelated pain.
 *
 * Failure case (before fix):
 *   Trainee: "What tools are you using?"
 *   Attendee: "we've been struggling with alert noise..."  ← WRONG
 *
 * Correct behavior after fix:
 *   Attendee: "Right now we're mostly using Splunk and Prometheus."  ← CORRECT
 *
 * Run with:  npx tsx lib/__tests__/answerContract.test.ts
 */

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

function assertMatches(label: string, actual: string, pattern: RegExp) {
  if (pattern.test(actual)) {
    console.log(`  \u2713 ${label}`);
    passed++;
  } else {
    console.error(`  \u2717 ${label}`);
    console.error(`      expected to match: ${pattern}`);
    console.error(`      received: ${JSON.stringify(actual)}`);
    failed++;
  }
}

function assertNotMatches(label: string, actual: string, pattern: RegExp) {
  if (!pattern.test(actual)) {
    console.log(`  \u2713 ${label}`);
    passed++;
  } else {
    console.error(`  \u2717 ${label}`);
    console.error(`      expected NOT to match: ${pattern}`);
    console.error(`      received: ${JSON.stringify(actual)}`);
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

/** A persona with pain anchors that don't relate to tools */
const MOCK_PERSONA = {
  id: "test-sre",
  name: "Test SRE",
  role: "SRE",
  company: "TestCo",
  emotionalPosture: "curious",
  painAnchors: [
    {
      id: "alert-noise",
      pain: "How do I minimize alert noise on-call?",
      keywords: ["alert", "noise", "on-call", "fatigue"],
      priority: "primary" as const,
    },
    {
      id: "toil",
      pain: "How do I reduce deployment toil?",
      keywords: ["deploy", "toil", "rollback", "manual"],
      priority: "secondary" as const,
    },
  ],
  questionBank: [],
  objectionBank: [],
  modifiers: [],
  isBuyer: false,
};

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

// ── Test 1: Tool question → tool answer, NOT a pain statement ─────────────────

console.log("\n\ud83d\udccb Test 1: Tool question → tool answer");

{
  const session = makeSession([
    { type: "system", text: "*approaches the booth*" },
    { type: "attendee", text: "Hey, we're evaluating some observability options." },
    { type: "trainee", text: "Oh nice, what problem are you trying to solve?" },
    { type: "attendee", text: "We have some pain around incidents and debugging." },
  ]);
  (session as any).persona = MOCK_PERSONA;

  const result = generateAttendeeReply({
    traineeText: "What tools are you currently using?",
    session,
    traineeTurnCount: 3,
  });

  assertNotNull("produces a reply", result);
  if (result) {
    assertNoQuestion("reply is a statement (no '?')", result.text);

    // Should NOT be an unrelated pain statement about alert noise
    const lowerText = result.text.toLowerCase();
    const isUnrelatedPain =
      lowerText.includes("alert noise") ||
      lowerText.includes("alert fatigue") ||
      lowerText.includes("on-call fatigue");
    assert("reply is NOT unrelated pain about alert noise", isUnrelatedPain, false);

    // Should be a tool or stack-related answer
    const isToolAnswer =
      lowerText.includes("using") ||
      lowerText.includes("tool") ||
      lowerText.includes("stack") ||
      lowerText.includes("mix") ||
      lowerText.includes("combination") ||
      lowerText.includes("running");
    assert("reply is a tool-answer", isToolAnswer, true);
  }
}

// ── Test 2: Process question → process answer ─────────────────────────────────

console.log("\n\ud83d\udccb Test 2: Process question → process answer");

{
  const session = makeSession([
    { type: "system", text: "*approaches booth*" },
    { type: "attendee", text: "Hey, we're dealing with some incident pain." },
    { type: "trainee", text: "What kind of pain are you seeing?" },
    { type: "attendee", text: "Mostly slow root cause analysis during incidents." },
  ]);
  (session as any).persona = MOCK_PERSONA;

  const result = generateAttendeeReply({
    traineeText: "How do you debug issues when something goes wrong?",
    session,
    traineeTurnCount: 3,
  });

  assertNotNull("produces a reply", result);
  if (result) {
    assertNoQuestion("reply is a statement", result.text);

    const lowerText = result.text.toLowerCase();
    // Should describe a process ("we usually", "when something", "our usual")
    const isProcessAnswer =
      lowerText.includes("usually") ||
      lowerText.includes("when something") ||
      lowerText.includes("start with") ||
      lowerText.includes("approach") ||
      lowerText.includes("manual");
    assert("reply describes a process", isProcessAnswer, true);
  }
}

// ── Test 3: Pain detail question → pain breakdown answer ──────────────────────

console.log("\n\ud83d\udccb Test 3: Pain detail question → breakdown answer");

{
  const session = makeSession([
    { type: "system", text: "*approaches booth*" },
    { type: "attendee", text: "We've been struggling with debugging during incidents." },
    { type: "trainee", text: "Yeah that's a common pain point." },
    { type: "attendee", text: "It's really slowing us down." },
  ]);
  (session as any).persona = MOCK_PERSONA;

  const result = generateAttendeeReply({
    traineeText: "Where does it slow down the most?",
    session,
    traineeTurnCount: 3,
  });

  assertNotNull("produces a reply", result);
  if (result) {
    assertNoQuestion("reply is a statement", result.text);

    const lowerText = result.text.toLowerCase();
    // Should describe where the breakdown is
    const isBreakdownAnswer =
      lowerText.includes("slowdown") ||
      lowerText.includes("slow down") ||
      lowerText.includes("biggest") ||
      lowerText.includes("hardest") ||
      lowerText.includes("breaks down") ||
      lowerText.includes("gap") ||
      lowerText.includes("scattered") ||
      lowerText.includes("correlat");
    assert("reply describes a breakdown", isBreakdownAnswer, true);
  }
}

// ── Test 4: Tool question with named tools in session ────────────────────────

console.log("\n\ud83d\udccb Test 4: Tool question with named tools → uses tool names");

{
  const session = makeSession(
    [
      { type: "system", text: "*approaches booth*" },
      { type: "attendee", text: "We've been using Splunk for logs and Grafana for dashboards." },
      { type: "trainee", text: "Oh nice, what's the experience been like?" },
      { type: "attendee", text: "It works but incidents are still rough." },
    ],
    { currentTools: ["splunk", "grafana"] }
  );
  (session as any).persona = MOCK_PERSONA;

  const result = generateAttendeeReply({
    traineeText: "What tools are you using right now?",
    session,
    traineeTurnCount: 3,
  });

  assertNotNull("produces a reply", result);
  if (result) {
    assertNoQuestion("reply is a statement", result.text);
    const lowerText = result.text.toLowerCase();
    const mentionsATool = lowerText.includes("splunk") || lowerText.includes("grafana");
    assert("reply mentions a named tool", mentionsATool, true);
  }
}

// ── Test 5: Alert fatigue NOT injected for unrelated questions ────────────────

console.log("\n\ud83d\udccb Test 5: Alert fatigue NOT injected for unrelated tool question");

{
  // Run 5 times to check across different turn counts (deterministic template cycling)
  let alertFatigueCount = 0;
  for (let i = 0; i < 5; i++) {
    const session = makeSession([
      { type: "system", text: "*approaches booth*" },
      { type: "attendee", text: "We're evaluating observability tooling." },
      { type: "trainee", text: "What kind of stack are you working with?" },
      { type: "attendee", text: "It's pretty fragmented right now." },
    ]);
    (session as any).persona = MOCK_PERSONA;

    const result = generateAttendeeReply({
      traineeText: "What tools are you using for logging?",
      session,
      traineeTurnCount: i,
    });

    if (result && /alert fatigue/i.test(result.text)) {
      alertFatigueCount++;
    }
  }
  assert("alert fatigue never appears for tool question (across 5 turns)", alertFatigueCount, 0);
}

// ── Test 6: Non-question answer can use pain anchors ─────────────────────────

console.log("\n\ud83d\udccb Test 6: Non-question answer (trainee elaborating) can use pain anchors");

{
  const session = makeSession([
    { type: "system", text: "*approaches booth*" },
    { type: "attendee", text: "We have a lot of alert noise during on-call." },
    { type: "trainee", text: "That sounds frustrating. Tell me more about the alert situation." },
    { type: "attendee", text: "Yeah, it's been rough." },
  ]);
  (session as any).persona = MOCK_PERSONA;

  // No question mark — trainee is elaborating/encouraging, not questioning
  const result = generateAttendeeReply({
    traineeText: "Yeah, alert noise on-call sounds really painful for your team.",
    session,
    traineeTurnCount: 3,
  });

  assertNotNull("produces a reply", result);
  if (result) {
    // When trainee is NOT asking a question, pain anchors are fine
    assertNoQuestion("reply is a statement", result.text);
  }
}

// ── Test 7: Hard fallback doesn't use generic pain for unknown question type ──

console.log("\n\ud83d\udccb Test 7: Hard fallback for unrecognized question type");

{
  const session = makeSession([
    { type: "system", text: "*approaches booth*" },
    { type: "attendee", text: "We're evaluating observability tools." },
    { type: "trainee", text: "What's your background?" },
    { type: "attendee", text: "I'm an SRE on a platform team." },
  ]);
  (session as any).persona = MOCK_PERSONA;

  // A question that doesn't match any specific type
  const result = generateAttendeeReply({
    traineeText: "What's your team size?",
    session,
    traineeTurnCount: 3,
  });

  assertNotNull("produces a reply", result);
  if (result) {
    assertNoQuestion("reply is a statement", result.text);
    // Should not produce a completely unrelated pain statement about alert fatigue
    // as the hard fallback is safe generic answers
    assert(
      "hard fallback is not a specific pain statement",
      /alert noise|on-call fatigue|deployment toil/i.test(result.text),
      false
    );
  }
}

// ── Report ──────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
