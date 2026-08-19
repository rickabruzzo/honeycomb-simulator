/**
 * Regression tests: scoring must derive ALL points from trainee messages only.
 *
 * Attendee text must never inflate listening, discovery, empathy, or any
 * breakdown category. Outcome detection must use attendee messages (not
 * trainee) so the trainee can't grant themselves bonus points.
 *
 * Run with:  npx tsx lib/__tests__/scoring.traineeOnly.test.ts
 */

import { heuristicScore } from "../scoring";
import type { SessionState } from "../storage";

let passed = 0;
let failed = 0;

function assert(label: string, actual: unknown, expected: unknown) {
  if (actual === expected) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`      expected: ${String(expected)}`);
    console.error(`      received: ${String(actual)}`);
    failed++;
  }
}

function assertLte(label: string, actual: number, max: number) {
  if (actual <= max) {
    console.log(`  ✓ ${label} (${actual} <= ${max})`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`      expected: <= ${max}`);
    console.error(`      received: ${actual}`);
    failed++;
  }
}

function assertGte(label: string, actual: number, min: number) {
  if (actual >= min) {
    console.log(`  ✓ ${label} (${actual} >= ${min})`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`      expected: >= ${min}`);
    console.error(`      received: ${actual}`);
    failed++;
  }
}

/** Build a minimal SessionState with just a transcript. */
function makeSession(
  transcript: Array<{ type: "system" | "trainee" | "attendee"; text: string }>,
  overrides?: Partial<SessionState>
): SessionState {
  return {
    id: "test-session",
    currentState: "DISCOVERY",
    stateHistory: [{ from: "ICEBREAKER", to: "DISCOVERY", timestamp: new Date().toISOString() }],
    transcript: transcript.map((m, i) => ({
      id: `msg-${i}`,
      ...m,
      timestamp: new Date(Date.now() + i * 1000).toISOString(),
    })),
    violations: [],
    kickoff: { attendeeProfile: "test persona" },
    startTime: new Date().toISOString(),
    active: false,
    ...overrides,
  } as SessionState;
}

// ── Test 1: Attendee empathy/discovery/listening must NOT inflate scores ────

console.log("\n1. Attendee language must NOT inflate trainee scores:");

const richAttendeeSession = makeSession([
  // Attendee uses tons of empathy, discovery, and listening phrases
  { type: "attendee", text: "That sounds really hard — how are you handling it today?" },
  { type: "attendee", text: "What tools are you currently using to debug production issues?" },
  { type: "attendee", text: "I can imagine that must be frustrating. That's tough." },
  { type: "attendee", text: "It sounds like you're dealing with something really rough and brutal." },
  { type: "attendee", text: "Walk me through your current workflow. Help me understand." },
  { type: "attendee", text: "You mentioned customer impact — tell me more about that." },
  // Trainee says something flat/short with no questions
  { type: "trainee", text: "ok" },
  { type: "trainee", text: "sure" },
  { type: "trainee", text: "cool" },
]);

const richAttendeeResult = heuristicScore(richAttendeeSession, "test-token-1");

assertLte("discovery ≤ 5 (trainee has no questions)", richAttendeeResult.breakdown.discovery, 5);
assertLte("empathy ≤ 5 (trainee shows no empathy)", richAttendeeResult.breakdown.empathy, 5);
assertLte("listening ≤ 5 (trainee reflects nothing)", richAttendeeResult.breakdown.listening, 5);

// ── Test 2: Trainee empathy/discovery/listening SHOULD inflate scores ───────

console.log("\n2. Trainee language SHOULD earn points:");

const richTraineeSession = makeSession([
  // Attendee says something minimal
  { type: "attendee", text: "Hi. Our alerts are noisy." },
  // Trainee uses strong discovery, listening, empathy
  { type: "trainee", text: "What tools are you currently using to monitor your services?" },
  { type: "trainee", text: "How do you handle debugging production issues today?" },
  { type: "trainee", text: "Walk me through what happens when an alert fires." },
  { type: "trainee", text: "That must be frustrating — I can imagine that's tough." },
  { type: "trainee", text: "It sounds like you're dealing with a lot of noise. You mentioned alerts being noisy — did I get that right?" },
  { type: "trainee", text: "Tell me more about the customer impact when these issues happen." },
]);

const richTraineeResult = heuristicScore(richTraineeSession, "test-token-2");

assertGte("discovery ≥ 12 (trainee asks many questions)", richTraineeResult.breakdown.discovery, 12);
assertGte("empathy ≥ 6 (trainee shows empathy)", richTraineeResult.breakdown.empathy, 6);
assertGte("listening ≥ 8 (trainee reflects back)", richTraineeResult.breakdown.listening, 8);

// ── Test 3: Attendee "outcome" phrases in trainee text must NOT trigger bonus ─

console.log("\n3. Trainee saying outcome phrases must NOT trigger outcome bonus:");

const traineeOutcomeSession = makeSession([
  { type: "attendee", text: "Tell me about your platform." },
  { type: "trainee", text: "Can I scan your badge? Show me a demo." },
  { type: "trainee", text: "Check out the free tier. I'll send you the docs." },
]);

const traineeOutcomeResult = heuristicScore(traineeOutcomeSession, "test-token-3");

// Without pendingOutcome set, the only way to get an outcome bonus is
// via detectOutcomeFromTranscript which filters to attendee messages.
// Since only the trainee said outcome phrases, score should NOT get the +10 bonus.
// Base max without outcome bonus: listening(5) + discovery(5*) + empathy(2) + otel(20) + guardrails(20) = 52
// (* "show" contains "how" substring → accidental open-ended match, pre-existing)
assertLte("total score ≤ 55 (no outcome bonus from trainee)", traineeOutcomeResult.score, 55);
// Crucially: with the old bug, trainee saying "demo"/"badge"/"scan" would have triggered
// a +10 outcome bonus, pushing this to 62. That must NOT happen.
assert("no outcome bonus (trainee outcome phrases ignored)", traineeOutcomeResult.score <= 55, true);

// ── Test 4: Attendee outcome signals DO trigger bonus ──────────────────────

console.log("\n4. Attendee outcome signals DO trigger outcome bonus:");

const attendeeOutcomeSession = makeSession([
  { type: "trainee", text: "What tools are you using to debug production issues?" },
  { type: "trainee", text: "How does that affect your customers?" },
  { type: "trainee", text: "It sounds like you need better observability." },
  { type: "attendee", text: "This sounds great — can you scan my badge so someone can follow up?" },
]);

const attendeeOutcomeResult = heuristicScore(attendeeOutcomeSession, "test-token-4");

// detectOutcomeFromTranscript should detect BADGE_SCAN → MQL_READY → +10 bonus
assertGte("total score ≥ 20 (outcome bonus from attendee)", attendeeOutcomeResult.score, 20);

// ── Test 5: Customer impact bonus only from trainee text ───────────────────

console.log("\n5. Customer impact bonus only from trainee text:");

const attendeeCustomerSession = makeSession([
  { type: "attendee", text: "Our customers are really suffering from this. Customer impact is huge." },
  { type: "trainee", text: "ok" },
]);

const attendeeCustomerResult = heuristicScore(attendeeCustomerSession, "test-token-5");

// Customer impact phrases came from attendee — should NOT get +5 bonus
// Base score with no trainee effort: listening(5) + discovery(0) + empathy(2) + otel(20) + guardrails(20) = 47
assertLte("score ≤ 50 (no customer bonus from attendee)", attendeeCustomerResult.score, 50);

const traineeCustomerSession = makeSession([
  { type: "attendee", text: "Our alerts fire a lot." },
  { type: "trainee", text: "How does that affect your customers and end users?" },
]);

const traineeCustomerResult = heuristicScore(traineeCustomerSession, "test-token-6");

// Customer impact from trainee — SHOULD get +5 bonus
assertGte("score ≥ 50 (customer bonus from trainee)", traineeCustomerResult.score, 50);

// ── Test 6: Highlights should not praise attendee behavior ─────────────────

console.log("\n6. Highlights should not praise attendee behavior:");

const richAttendeeHighlights = richAttendeeResult.highlights;

assert(
  "no 'Strong active listening' highlight (attendee was the listener)",
  richAttendeeHighlights.some((h) => h.includes("active listening")),
  false
);

assert(
  "no 'open-ended discovery' highlight (attendee asked the questions)",
  richAttendeeHighlights.some((h) => h.includes("discovery")),
  false
);

assert(
  "no 'empathy' highlight (attendee showed empathy, not trainee)",
  richAttendeeHighlights.some((h) => h.includes("empathy") || h.includes("Empathy")),
  false
);

// ── Summary ────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
