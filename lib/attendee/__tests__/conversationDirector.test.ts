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

// ── Test 6: Reflection marker → not misaligned (no repair) ──────────────────

console.log("\nReflection marker alignment:");

// Trainee uses "sounds like" — a reflection marker → always aligned (Tier 1)
const reflectionSession = makeSession([
  { type: "attendee", text: "We're drowning in false positive alerts and it's exhausting." },
  { type: "trainee", text: "Sounds like alert fatigue is the core pain here — how long has this been going on?" },
]);
const reflectionDirective = decideNextMove(
  reflectionSession,
  undefined,
  "Sounds like alert fatigue is the core pain here — how long has this been going on?"
);
expect(
  'trainee uses "sounds like" (reflection marker) → NOT ask_clarifying repair',
  reflectionDirective.move !== "ask_clarifying",
  true
);
// With pain keywords in attendee text ("alerts"), stage should be DISCOVERY
expect(
  'reflection marker session → DISCOVERY stage (pain surfaced)',
  reflectionDirective.stage,
  "DISCOVERY"
);

// ── Test 7: Anti-loop — same move 2x in last 4 → different next move ──────────

console.log("\nAnti-loop diversity:");

// share_pain used twice in last 4 → should not produce share_pain again
const antiLoopSession = makeSession([
  { type: "attendee", text: "We deal with a lot of incident toil and slow debugging cycles." },
  { type: "trainee", text: "Tell me more about your current incident workflow." },
]);
(antiLoopSession as any).directorHistory = [
  "share_pain",
  "ask_clarifying",
  "share_pain", // second usage in last 4
];
const antiLoopDirective = decideNextMove(
  antiLoopSession,
  undefined,
  "Tell me more about your current incident workflow."
);
expect(
  'share_pain used 2x in last 4 turns → anti-loop fires → not share_pain',
  antiLoopDirective.move !== "share_pain",
  true
);

// ask_rollout_effort used as last move → should not repeat consecutively
const rolloutConsecutiveSession = makeSession([
  { type: "attendee", text: "I am curious what the rollout effort looks like for this." },
  { type: "trainee", text: "Great question — the rollout is actually pretty lightweight." },
  { type: "attendee", text: "That sounds useful for exactly what we are dealing with." },
], 25);
(rolloutConsecutiveSession as any).directorHistory = [
  "ask_clarifying",
  "share_pain",
  "ask_rollout_effort", // just used
];
const rolloutNextDirective = decideNextMove(
  rolloutConsecutiveSession,
  undefined,
  "Great question — the rollout is actually pretty lightweight."
);
expect(
  'ask_rollout_effort as last move → not repeated consecutively',
  rolloutNextDirective.move !== "ask_rollout_effort",
  true
);

// ── Test 8: CTA not chosen before discovery depth ─────────────────────────────

console.log("\nCTA depth gate:");

// RAPPORT stage + CURIOUS band but only 1 attendee message + 2 total → no CTA
const earlyCtaSession = makeSession([
  { type: "attendee", text: "I'm a senior SRE at a mid-size fintech." },
  { type: "trainee", text: "Great to meet you! We actually help SRE teams a lot." },
], 25); // CURIOUS band
const earlyCtaDirective = decideNextMove(
  earlyCtaSession,
  undefined,
  "Great to meet you! We actually help SRE teams a lot."
);
expect(
  'RAPPORT stage, 1 attendee msg, 2 total → ask_demo NOT chosen',
  earlyCtaDirective.move !== "ask_demo",
  true
);
expect(
  'RAPPORT stage, 1 attendee msg, 2 total → ask_badge NOT chosen',
  earlyCtaDirective.move !== "ask_badge",
  true
);
expect(
  'RAPPORT stage, 1 attendee msg, 2 total → ask_docs NOT chosen',
  earlyCtaDirective.move !== "ask_docs",
  true
);

// Deep conversation (VALUE + ENGAGED + 3 attendee + 6 total) → CTA is eligible
const deepCtaSession = makeSession([
  { type: "attendee", text: "We're drowning in alert noise and every incident takes hours to debug." },
  { type: "trainee", text: "With Honeycomb you can trace those incidents in real time." },
  { type: "attendee", text: "Tracing incidents in real time sounds genuinely useful for us." },
  { type: "trainee", text: "The rollout is surprisingly lightweight for most teams." },
  { type: "attendee", text: "That sounds valuable — I'd love to explore this more with my team." },
  { type: "trainee", text: "We could definitely set something up for your team." },
], 50); // ENGAGED band
const deepCtaDirective = decideNextMove(
  deepCtaSession,
  undefined,
  "We could definitely set something up for your team."
);
// With VALUE + ENGAGED + 3 attendee + 6 total → CTA moves ARE eligible
// The stage at this point should be VALUE (aha pattern in attendee text)
// The directive should NOT be a simple deflect or ask_clarifying at depth
expect(
  'VALUE + ENGAGED + 3 attendee + 6 total → CTA is eligible (not blocked)',
  // Either a CTA move or an engagement move — just not deflect/exit
  deepCtaDirective.move !== "deflect" && deepCtaDirective.move !== "exit",
  true
);

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
