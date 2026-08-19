/**
 * Tests for lib/attendee/conversationDirector.ts
 *
 * Covers:
 *  1. Misalignment → repair move (ask_clarifying)
 *  2. No premature commitment on first exchange
 *  3. Stage progression when aha signal is present
 *  4. Anti-repeat: move too recent → ask_clarifying fallback
 *  5. isTraineeAligned — off-topic vs. on-topic
 *
 * Run with:  npx tsx lib/attendee/__tests__/conversationDirector.test.ts
 */

import {
  decideNextMove,
  isTraineeAligned,
  getDirectorHistory,
} from "../conversationDirector";
import type { SessionState } from "../../storage";

let passed = 0;
let failed = 0;

function expect(label: string, actual: unknown, expected: unknown) {
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

// ── Session factory ───────────────────────────────────────────────────────────

function makeSession(
  transcript: Array<{ type: "system" | "trainee" | "attendee"; text: string }>,
  momentumScore = 0
): SessionState {
  return {
    id: "test-session",
    active: true,
    currentState: "EXPLORATION",
    transcript: transcript.map((m, i) => ({
      id: `msg-${i}`,
      ...m,
      timestamp: new Date().toISOString(),
    })),
    momentum: { score: momentumScore, turns: 0, recentScores: [] } as any,
    violations: [],
    stateHistory: [],
    expressedIntents: [],
    kickoff: {
      attendeeProfile: "Test persona: SRE dealing with on-call toil",
      trainerName: "Test Trainer",
    },
  } as any;
}

// ── Test 1: Misalignment → repair ─────────────────────────────────────────────

console.log("\nMisalignment repair:");

// Trainee pivots to a completely unrelated topic — no shared keywords
const misalignedSession = makeSession([
  { type: "attendee", text: "We're dealing with a lot of on-call toil and alert fatigue." },
  { type: "trainee", text: "Our product has great UI customization options." },
]);
const misalignedDirective = decideNextMove(
  misalignedSession,
  undefined,
  "Our product has great UI customization options."
);
expect(
  'trainee pivots to unrelated topic → ask_clarifying',
  misalignedDirective.move,
  "ask_clarifying"
);
expect(
  'repair move has correct stage (DISCOVERY — pain was surfaced)',
  misalignedDirective.stage,
  "DISCOVERY"
);

// Trainee stays on-topic (follow-up question with keyword overlap) — no repair
const alignedSession = makeSession([
  { type: "attendee", text: "We're dealing with alert fatigue on our on-call rotations." },
  { type: "trainee", text: "How does your current alerting setup handle noise reduction?" },
]);
const alignedDirective = decideNextMove(
  alignedSession,
  undefined,
  "How does your current alerting setup handle noise reduction?"
);
expect(
  'trainee asks keyword-overlapping question → not ask_clarifying (aligned)',
  alignedDirective.move !== "ask_clarifying",
  true
);

// ── Test 2: No premature commitment on first exchange ─────────────────────────

console.log("\nNo premature commitment:");

// Single trainee message, momentum = 0 (GUARDED), no attendee messages yet
const earlySession = makeSession([
  { type: "trainee", text: "Hey, welcome to our booth!" },
], 0);
const earlyDirective = decideNextMove(
  earlySession,
  undefined,
  "Hey, welcome to our booth!"
);
expect(
  'first exchange, GUARDED band → move is not ask_badge',
  earlyDirective.move !== "ask_badge",
  true
);
expect(
  'first exchange, GUARDED band → move is deflect (HOOK + GUARDED)',
  earlyDirective.move,
  "deflect"
);
expect(
  'first exchange → stage is HOOK',
  earlyDirective.stage,
  "HOOK"
);
expect(
  'first exchange → tone is guarded',
  earlyDirective.tone,
  "guarded"
);

// ── Test 3: Stage progression — aha signal → VALUE stage ─────────────────────

console.log("\nStage progression:");

// Attendee said "that sounds useful" — AHA_PATTERN fires → VALUE stage
const ahaSession = makeSession([
  { type: "attendee", text: "We're constantly fighting incidents and slow debug cycles." },
  { type: "trainee", text: "Honeycomb lets you slice traces in real time during incidents." },
  { type: "attendee", text: "That sounds useful for exactly what we're dealing with." },
], 25); // CURIOUS band
const ahaDirective = decideNextMove(
  ahaSession,
  undefined,
  "Honeycomb lets you slice traces in real time during incidents."
);
expect(
  'attendee says "that sounds useful" → VALUE stage',
  ahaDirective.stage,
  "VALUE"
);
expect(
  'VALUE + CURIOUS band → tone is curious',
  ahaDirective.tone,
  "curious"
);
// VALUE + CURIOUS + empty history → ask_clarifying (no last move in history)
expect(
  'VALUE + CURIOUS, no history → ask_clarifying (alternation start)',
  ahaDirective.move,
  "ask_clarifying"
);

// Same scenario but higher momentum (ENGAGED) with a trainee msg that shares
// keywords with the last attendee message — alignment passes → stage routing fires
const ahaSessionEngaged = makeSession([
  { type: "attendee", text: "We spend hours debugging incidents and it is painful." },
  { type: "trainee", text: "With Honeycomb you see those debugging incidents in seconds." },
  { type: "attendee", text: "Debugging incidents in seconds sounds useful and valuable." },
], 40); // ENGAGED band
const ahaEngagedDirective = decideNextMove(
  ahaSessionEngaged,
  undefined,
  "With Honeycomb you see those debugging incidents in seconds."
);
expect(
  'VALUE + ENGAGED, empty history → ask_rollout_effort (probing before commitment)',
  ahaEngagedDirective.move,
  "ask_rollout_effort"
);

// ── Test 4: Anti-repeat — share_pain used 4 times → ask_clarifying ───────────

console.log("\nAnti-repeat protection:");

// Inject a saturated director history into session
const antiRepeatSession = makeSession([
  { type: "attendee", text: "Our stack is fragmented and debugging is painful." },
  { type: "trainee", text: "Tell me more about your setup." },
]);
(antiRepeatSession as any).directorHistory = [
  "share_pain",
  "share_pain",
  "share_pain",
  "share_pain",
];
const antiRepeatDirective = decideNextMove(
  antiRepeatSession,
  undefined,
  "Tell me more about your setup."
);
expect(
  'share_pain repeated 4x → anti-repeat kicks in → ask_clarifying',
  antiRepeatDirective.move,
  "ask_clarifying"
);

// ask_badge has a 2-turn cooldown — used once recently → blocked
const badgeCooldownSession = makeSession([
  { type: "attendee", text: "That sounds interesting—can we follow up?" },
  { type: "trainee", text: "Absolutely! Want me to scan your badge?" },
], 60); // COMMITTED band
(badgeCooldownSession as any).directorHistory = ["ask_badge"];
const badgeCooldownDirective = decideNextMove(
  badgeCooldownSession,
  undefined,
  "Absolutely! Want me to scan your badge?"
);
expect(
  'ask_badge in recent history (cooldown=2) → not ask_badge',
  badgeCooldownDirective.move !== "ask_badge",
  true
);

// ── Test 5: isTraineeAligned ──────────────────────────────────────────────────

console.log("\nisTraineeAligned:");

expect(
  'completely off-topic trainee → not aligned',
  isTraineeAligned(
    "Our product has great UI customization options.",
    "We're dealing with on-call toil and alert fatigue."
  ),
  false
);

expect(
  'trainee question with keyword overlap → aligned',
  isTraineeAligned(
    "How does that help with alert fatigue?",
    "We have a lot of alert fatigue on our team."
  ),
  true
);

expect(
  'trainee follow-up pronoun with no keyword overlap → aligned (pronoun sufficient)',
  isTraineeAligned(
    "That performance issue is exactly what we solve.",
    "We spend hours debugging incidents."
  ),
  true
);

expect(
  'empty attendee text → aligned by default',
  isTraineeAligned("Hello there.", ""),
  true
);

expect(
  'empty trainee text → aligned by default',
  isTraineeAligned("", "We have issues with latency monitoring."),
  true
);

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
