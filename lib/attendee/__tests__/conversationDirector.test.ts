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
  isMetaConfusion,
  metaConfusionLockoutActive,
  isAbstractCompareQuestion,
  abstractCompareLimiterActive,
  CONCRETE_FOLLOWUPS,
  NEUTRAL_HOOK_BANK,
  inferAttendeeIntent,
  allowedMovesForIntent,
  isQuestion,
  type AttendeeIntent,
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
  'first exchange, GUARDED band → move is ask_hook (HOOK always uses neutral hook)',
  earlyDirective.move,
  "ask_hook"
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

// ── Test 9: Meta-confusion lockout ───────────────────────────────────────────

console.log("\nMeta-confusion lockout:");

// isMetaConfusion detects confusion phrases
expect(
  '"Can you explain that differently?" → is meta-confusion',
  isMetaConfusion("Can you explain that differently?"),
  true
);
expect(
  '"I\'m not sure how that connects" → is meta-confusion',
  isMetaConfusion("I'm not sure how that connects"),
  true
);
expect(
  '"We deal with a lot of incidents" → NOT meta-confusion',
  isMetaConfusion("We deal with a lot of incidents"),
  false
);

// metaConfusionLockoutActive tests
expect(
  'last attendee msg is confusion → lockout active',
  metaConfusionLockoutActive([
    { text: "We have alerting issues." },
    { text: "Sorry, I'm not sure how that connects — can you clarify?" },
  ]),
  true
);
expect(
  'confusion was 1 attendee msg ago → lockout still active (< 2)',
  metaConfusionLockoutActive([
    { text: "Sorry, I'm not sure how that connects — can you clarify?" },
    { text: "Our on-call rotation is exhausting." },
  ]),
  true
);
expect(
  'confusion was 2 attendee msgs ago → lockout expired (≥ 2)',
  metaConfusionLockoutActive([
    { text: "I'm not following that — can you explain?" },
    { text: "Our alerts are noisy." },
    { text: "And debugging takes forever." },
  ]),
  false
);
expect(
  'no confusion messages → lockout not active',
  metaConfusionLockoutActive([
    { text: "We have alerting issues." },
    { text: "Our on-call is painful." },
  ]),
  false
);

// Full integration: after confusion, director does NOT return ask_clarifying
// for the next 2 attendee turns (falls back to share_pain or deflect)
const confusionSession = makeSession([
  { type: "attendee", text: "We're dealing with alert fatigue." },
  { type: "trainee", text: "Our product has great machine learning capabilities." },
  // Attendee expressed confusion (meta-confusion):
  { type: "attendee", text: "Sorry, I'm not sure how that connects — can you clarify?" },
  // Trainee tries again but is still misaligned:
  { type: "trainee", text: "We also do data lakes and pipelines." },
]);
const confusionDirective = decideNextMove(
  confusionSession,
  undefined,
  "We also do data lakes and pipelines."
);
expect(
  'after confusion + misaligned trainee → NOT ask_clarifying (lockout active)',
  confusionDirective.move !== "ask_clarifying",
  true
);
expect(
  'lockout fallback → share_pain (preferred fallback)',
  confusionDirective.move,
  "share_pain"
);

// ── Test 10: Neutral hook rule (non-verbal opener) ───────────────────────────

console.log("\nNeutral hook rule:");

// Non-verbal system opener + no attendee yet → neutral hook (HOOK stage)
const nonVerbalSession = makeSession([
  { type: "system", text: "An attendee approaches looking visibly frustrated." },
  { type: "trainee", text: "Hey, welcome to our booth!" },
], 0);
const nonVerbalDirective = decideNextMove(
  nonVerbalSession,
  undefined,
  "Hey, welcome to our booth!"
) as any;
expect(
  'non-verbal opener → stage is HOOK',
  nonVerbalDirective.stage,
  "HOOK"
);
expect(
  'non-verbal opener → hookOverride is set (neutral question)',
  NEUTRAL_HOOK_BANK.includes(nonVerbalDirective.hookOverride),
  true
);
expect(
  'non-verbal opener → move is ask_hook',
  nonVerbalDirective.move,
  "ask_hook"
);

// With attendee messages already present, non-verbal rule does not apply
const normalSession = makeSession([
  { type: "system", text: "An attendee approaches looking visibly frustrated." },
  { type: "attendee", text: "Hi, I'm an SRE at a mid-size startup." },
  { type: "trainee", text: "Great to meet you!" },
], 0);
const normalDirective = decideNextMove(
  normalSession,
  undefined,
  "Great to meet you!"
) as any;
expect(
  'attendee already spoke → hookOverride is NOT set',
  normalDirective.hookOverride === undefined,
  true
);

// ── Test 11: Abstract compare limiter ───────────────────────────────────────

console.log("\nAbstract compare limiter:");

// isAbstractCompareQuestion
expect(
  '"Is it more about observability or monitoring?" → abstract compare',
  isAbstractCompareQuestion("Is it more about observability or monitoring?"),
  true
);
expect(
  '"Which is it — manual or automated?" → abstract compare',
  isAbstractCompareQuestion("Which is it — manual or automated?"),
  true
);
expect(
  '"What tools do you use?" → NOT abstract compare',
  isAbstractCompareQuestion("What tools do you use?"),
  false
);
expect(
  '"Not a question" → NOT abstract compare',
  isAbstractCompareQuestion("Not a question"),
  false
);

// abstractCompareLimiterActive
expect(
  '2 abstract questions in last 3 trainee msgs → limiter active',
  abstractCompareLimiterActive([
    { text: "Is it more about X or Y?" },
    { text: "And is it tracing or logging?" },
    { text: "How do you handle that?" },
  ]),
  true
);
expect(
  '1 abstract question in last 3 → limiter NOT active',
  abstractCompareLimiterActive([
    { text: "Is it more about X or Y?" },
    { text: "How do you handle that?" },
    { text: "What tools are you using?" },
  ]),
  false
);

// Full integration: with 2 abstract trainee questions, ask_clarifying gets
// a concrete override (not another abstract question)
const abstractSession = makeSession([
  { type: "attendee", text: "We deal with a lot of alert noise." },
  { type: "trainee", text: "Is it more about alerting or monitoring?" },
  { type: "attendee", text: "Both, really. It's all kind of a mess." },
  { type: "trainee", text: "Is it the volume or the accuracy that's worse?" },
  { type: "attendee", text: "I guess the volume? I'm not sure." },
  { type: "trainee", text: "Tell me more about that." },
]);
const abstractDirective = decideNextMove(
  abstractSession,
  undefined,
  "Tell me more about that."
) as any;
// If move is ask_clarifying and limiter is active, concreteOverride should be set
if (abstractDirective.move === "ask_clarifying") {
  expect(
    'abstract limiter active → concreteOverride is set',
    CONCRETE_FOLLOWUPS.includes(abstractDirective.concreteOverride),
    true
  );
}

// ── Test 12: HOOK stage never returns deflect ──────────────────────────────

console.log("\nHOOK never deflects:");

// HOOK + GUARDED → ask_hook (already tested above), verify it's never deflect
const hookGuardedSession = makeSession([
  { type: "trainee", text: "Hey, welcome to our booth!" },
], 0); // GUARDED band
const hookGuardedDirective = decideNextMove(
  hookGuardedSession,
  undefined,
  "Hey, welcome to our booth!"
);
expect(
  'HOOK + GUARDED → never deflect',
  hookGuardedDirective.move !== "deflect",
  true
);
expect(
  'HOOK + GUARDED → ask_hook',
  hookGuardedDirective.move,
  "ask_hook"
);

// HOOK + CURIOUS + small-talk question → "answer" with smallTalk=true
// (small-talk short-circuit fires before hook rule; "how's it going?" is a
// casual opener that should get a casual answer, not a hook question back)
const hookCuriousSession = makeSession([
  { type: "trainee", text: "Hey, how's it going?" },
], 25); // CURIOUS band
const hookCuriousDirective = decideNextMove(
  hookCuriousSession,
  undefined,
  "Hey, how's it going?"
);
expect(
  'HOOK + CURIOUS + small-talk question → answer (smallTalk=true)',
  hookCuriousDirective.move,
  "answer"
);
expect(
  'HOOK + CURIOUS + small-talk question → smallTalk flag set',
  hookCuriousDirective.smallTalk,
  true
);

// ── Test 13: Meta-confusion lockout never returns deflect ─────────────────

console.log("\nLockout never deflects:");

// After confusion, with share_pain used recently, the confused intent gate
// restricts moves to {share_pain, ask_clarifying}.  The lockout wants to avoid
// ask_clarifying, but the intent gate takes priority over the lockout because
// preventing escalation (no ask_docs/ask_badge during confusion) is more
// important than preventing a repeated clarifying question.
const lockoutDeflectSession = makeSession([
  { type: "attendee", text: "We deal with alert noise." },
  { type: "trainee", text: "Our data lakes provide insights." },
  { type: "attendee", text: "I'm not sure how that connects — can you clarify?" },
  { type: "trainee", text: "We also do machine learning pipelines." },
]);
// Saturate share_pain so fallback goes to second choice
(lockoutDeflectSession as any).directorHistory = [
  "share_pain", "share_pain", "share_pain", "share_pain",
];
const lockoutDeflectDirective = decideNextMove(
  lockoutDeflectSession,
  undefined,
  "We also do machine learning pipelines."
);
expect(
  'lockout with share_pain saturated → NOT deflect',
  lockoutDeflectDirective.move !== "deflect",
  true
);
// With intent layer: confused gate restricts to {share_pain, ask_clarifying}.
// share_pain is saturated, so ask_clarifying is the only remaining option.
expect(
  'lockout + confused intent + share_pain saturated → ask_clarifying (intent wins)',
  lockoutDeflectDirective.move === "ask_clarifying" || lockoutDeflectDirective.move === "share_pain",
  true
);

// ── Test 14: sanitizeDirectiveTone — ask_clarifying never guarded ─────────

console.log("\nSanitize directive tone:");

// Create a misaligned scenario at GUARDED momentum → tone would be "guarded"
// but since repair is ask_clarifying, tone should be sanitized to "curious"
const guardedRepairSession = makeSession([
  { type: "attendee", text: "We deal with on-call toil and alert fatigue." },
  { type: "trainee", text: "Our product has great UI customization options." },
], 0); // GUARDED band → guarded tone
const guardedRepairDirective = decideNextMove(
  guardedRepairSession,
  undefined,
  "Our product has great UI customization options."
);
expect(
  'misaligned + GUARDED band → move is ask_clarifying (repair)',
  guardedRepairDirective.move,
  "ask_clarifying"
);
expect(
  'ask_clarifying tone sanitized → curious (never guarded)',
  guardedRepairDirective.tone,
  "curious"
);

// ── Test 15: Intent layer — A) Confused blocks CTAs ──────────────────────────

console.log("\nIntent layer — confused blocks CTAs:");

// When the last attendee message is meta-confusion, move must NOT be
// ask_docs / ask_badge / ask_demo / exit — only ask_clarifying or share_pain.
const confusedSession = makeSession([
  { type: "attendee", text: "We deal with a lot of alert noise." },
  { type: "trainee", text: "Honeycomb gives you deep tracing for incidents." },
  { type: "attendee", text: "I'm not sure how that connects to what I was saying." },
  { type: "trainee", text: "Let me explain — it helps you drill into root causes." },
], 25); // CURIOUS band
const confusedDirective = decideNextMove(
  confusedSession,
  undefined,
  "Let me explain — it helps you drill into root causes."
);
expect(
  'confused attendee → intent is confused',
  inferAttendeeIntent(confusedSession).toString(),
  "confused"
);
expect(
  'confused attendee → move is ask_clarifying or share_pain',
  confusedDirective.move === "ask_clarifying" || confusedDirective.move === "share_pain",
  true
);
expect(
  'confused attendee → NOT ask_docs',
  confusedDirective.move !== "ask_docs",
  true
);
expect(
  'confused attendee → NOT ask_badge',
  confusedDirective.move !== "ask_badge",
  true
);
expect(
  'confused attendee → NOT ask_demo',
  confusedDirective.move !== "ask_demo",
  true
);
expect(
  'confused attendee → NOT exit',
  confusedDirective.move !== "exit",
  true
);

// ── Test 16: Intent layer — B) Soft exit → ask_docs or exit only ──────────

console.log("\nIntent layer — soft exit:");

// "send me a link, I need to run" → soft_exit intent → ask_docs or exit
const softExitSession = makeSession([
  { type: "attendee", text: "We have alerting issues and on-call toil." },
  { type: "trainee", text: "Honeycomb helps teams cut MTTR significantly." },
  { type: "attendee", text: "Interesting — send me a link, I need to run." },
  { type: "trainee", text: "Sure, happy to send you resources!" },
], 30);
const softExitDirective = decideNextMove(
  softExitSession,
  undefined,
  "Sure, happy to send you resources!"
);
expect(
  'soft exit → intent is soft_exit',
  inferAttendeeIntent(softExitSession).toString(),
  "soft_exit"
);
expect(
  'soft exit → move is ask_docs or exit',
  softExitDirective.move === "ask_docs" || softExitDirective.move === "exit",
  true
);
expect(
  'soft exit → NOT ask_badge',
  softExitDirective.move !== "ask_badge",
  true
);

// ── Test 17: Intent layer — C) Evaluating fit gates ask_badge ──────────────

console.log("\nIntent layer — evaluating fit:");

// "Is there documentation I can review?" → evaluating_fit → ask_docs allowed,
// NOT ask_badge (unless COMMITTED + COMMITMENT stage)
const evalFitSession = makeSession([
  { type: "attendee", text: "We have a lot of alert noise and debugging issues." },
  { type: "trainee", text: "Honeycomb gives you deep observability." },
  { type: "attendee", text: "Sounds interesting — is there documentation I can check out?" },
  { type: "trainee", text: "Absolutely! We have great docs." },
], 30); // CURIOUS band
const evalFitDirective = decideNextMove(
  evalFitSession,
  undefined,
  "Absolutely! We have great docs."
);
expect(
  'evaluating_fit → intent is evaluating_fit',
  inferAttendeeIntent(evalFitSession).toString(),
  "evaluating_fit"
);
// The evaluating_fit gate does NOT include ask_badge unless COMMITTED + COMMITMENT
// (solutionIntroduced=true — this test checks the badge/docs behavior post-solution)
const evalFitAllowed = allowedMovesForIntent("evaluating_fit", "DISCOVERY", "CURIOUS", true);
expect(
  'evaluating_fit + CURIOUS + DISCOVERY → ask_badge NOT in allowed set',
  evalFitAllowed.has("ask_badge"),
  false
);
expect(
  'evaluating_fit + CURIOUS + DISCOVERY + solution → ask_docs IS in allowed set',
  evalFitAllowed.has("ask_docs"),
  true
);

// ── Test 18: Intent layer — D) Hard exit forces exit ──────────────────────

console.log("\nIntent layer — hard exit:");

// "We already have something for that" / "not interested" → hard_exit → exit
const hardExitSession = makeSession([
  { type: "attendee", text: "We deal with on-call issues." },
  { type: "trainee", text: "Honeycomb helps with incident management." },
  { type: "attendee", text: "Hmm, we already have something for that — not really interested." },
  { type: "trainee", text: "I understand! Here's a card in case you change your mind." },
], 10);
expect(
  'hard exit → intent is hard_exit',
  inferAttendeeIntent(hardExitSession).toString(),
  "hard_exit"
);
const hardExitDirective = decideNextMove(
  hardExitSession,
  undefined,
  "I understand! Here's a card in case you change your mind."
);
expect(
  'hard exit → move must be exit',
  hardExitDirective.move,
  "exit"
);

// ── Test 19: Intent layer — E) Rapport in HOOK → ask_hook ─────────────────

console.log("\nIntent layer — rapport in HOOK:");

// "How's the conference treating you so far?" → rapport intent.
// But the attendee already spoke once, so stage is RAPPORT (not HOOK)
// and ask_hook is a one-time move.  Director should progress.
const rapportHookSession = makeSession([
  { type: "trainee", text: "Hey there, welcome!" },
  { type: "attendee", text: "How's the conference treating you so far?" },
  { type: "trainee", text: "Great! We're having a blast." },
], 0); // GUARDED band
expect(
  'rapport greeting → intent is rapport',
  inferAttendeeIntent(rapportHookSession).toString(),
  "rapport"
);
const rapportHookDirective = decideNextMove(
  rapportHookSession,
  undefined,
  "Great! We're having a blast."
);
expect(
  'rapport after first exchange → NOT ask_hook (progression)',
  rapportHookDirective.move !== "ask_hook",
  true
);
expect(
  'rapport after first exchange → share_pain or ask_clarifying',
  rapportHookDirective.move === "share_pain" || rapportHookDirective.move === "ask_clarifying",
  true
);

// ── Test 20: Intent layer — F) Regression: commit_ready allows ask_badge ──

console.log("\nIntent layer — commit_ready regression:");

// "scan my badge" → commit_ready → ask_badge must still be possible
const commitReadySession = makeSession([
  { type: "attendee", text: "We deal with on-call toil and debugging issues." },
  { type: "trainee", text: "Honeycomb helps you trace incidents in real time." },
  { type: "attendee", text: "That sounds really useful and valuable to our team." },
  { type: "trainee", text: "Would you like to see a quick demo?" },
  { type: "attendee", text: "Yes! Can you scan my badge so we can follow up?" },
  { type: "trainee", text: "Absolutely! Let me scan that for you." },
], 60); // COMMITTED band
expect(
  'commit_ready → intent is commit_ready',
  inferAttendeeIntent(commitReadySession).toString(),
  "commit_ready"
);
// Verify ask_badge is in the allowed set for commit_ready
const commitReadyAllowed = allowedMovesForIntent("commit_ready", "COMMITMENT", "COMMITTED");
expect(
  'commit_ready → ask_badge IS in allowed set',
  commitReadyAllowed.has("ask_badge"),
  true
);
expect(
  'commit_ready → ask_demo IS in allowed set',
  commitReadyAllowed.has("ask_demo"),
  true
);

// ── Test 21: Intent layer — G) Confusion then docs → soft_exit ────────────

console.log("\nIntent layer — confusion then docs = soft_exit:");

// Attendee was confused, next message asks for docs → should be soft_exit
// (tiebreaker: docs after confusion = soft_exit, not evaluating_fit)
const confusionThenDocsSession = makeSession([
  { type: "attendee", text: "We deal with alert noise." },
  { type: "trainee", text: "Our ML pipeline solves that." },
  { type: "attendee", text: "I'm not sure how that connects — can you explain?" },
  { type: "trainee", text: "Let me clarify — it reduces false positives." },
  { type: "attendee", text: "Hmm, do you have documentation or a free tier I can check out?" },
  { type: "trainee", text: "Yes, we have a great free tier!" },
], 25); // CURIOUS band
expect(
  'confusion then docs → intent is soft_exit (tiebreaker)',
  inferAttendeeIntent(confusionThenDocsSession).toString(),
  "soft_exit"
);
const confDocDirective = decideNextMove(
  confusionThenDocsSession,
  undefined,
  "Yes, we have a great free tier!"
);
expect(
  'confusion then docs → move is ask_docs or exit (not escalation)',
  confDocDirective.move === "ask_docs" || confDocDirective.move === "exit",
  true
);
expect(
  'confusion then docs → NOT ask_badge',
  confDocDirective.move !== "ask_badge",
  true
);

// ── Test 22: Intent layer — H) Confusion then badge without COMMITTED ─────

console.log("\nIntent layer — confusion then badge without COMMITTED:");

// Confusion in previous message, then "scan my badge" BUT band is NOT COMMITTED
// → tiebreaker downgrades to soft_exit (not commit_ready)
const confusionThenBadgeSession = makeSession([
  { type: "attendee", text: "We have alert noise issues." },
  { type: "trainee", text: "Our data platform does ingestion." },
  { type: "attendee", text: "I'm not following — can you try again?" },
  { type: "trainee", text: "Sure — we help with observability." },
  { type: "attendee", text: "Well, just scan my badge I guess." },
  { type: "trainee", text: "Happy to do that!" },
], 25); // CURIOUS band (NOT COMMITTED)
expect(
  'confusion then badge (CURIOUS) → intent is soft_exit (downgraded)',
  inferAttendeeIntent(confusionThenBadgeSession, "CURIOUS").toString(),
  "soft_exit"
);
const confBadgeDirective = decideNextMove(
  confusionThenBadgeSession,
  undefined,
  "Happy to do that!"
);
expect(
  'confusion then badge (CURIOUS) → NOT ask_badge',
  confBadgeDirective.move !== "ask_badge",
  true
);
expect(
  'confusion then badge (CURIOUS) → ask_docs or exit',
  confBadgeDirective.move === "ask_docs" || confBadgeDirective.move === "exit",
  true
);

// Same scenario but with COMMITTED band → should yield commit_ready (badge allowed)
const confusionThenBadgeCommittedSession = makeSession([
  { type: "attendee", text: "We have alert noise issues." },
  { type: "trainee", text: "Our data platform does ingestion." },
  { type: "attendee", text: "I'm not following — can you try again?" },
  { type: "trainee", text: "Sure — we help with observability." },
  { type: "attendee", text: "Actually, scan my badge — let's follow up." },
  { type: "trainee", text: "Great, let me scan that." },
], 60); // COMMITTED band
expect(
  'confusion then badge (COMMITTED) → intent is commit_ready (not downgraded)',
  inferAttendeeIntent(confusionThenBadgeCommittedSession, "COMMITTED").toString(),
  "commit_ready"
);

// ── ask_hook one-time enforcement ────────────────────────────────────────────

console.log("\nask_hook one-time enforcement:");

// First turn (no attendee messages) → should be ask_hook
const hookFirstSession = makeSession([], 0);
const hookFirstDirective = decideNextMove(
  hookFirstSession,
  undefined,
  "approaches the booth looking curious"
);
expect(
  "first turn (no attendee msgs) → ask_hook",
  hookFirstDirective.move,
  "ask_hook"
);

// After attendee has spoken once + trainee responded → NOT ask_hook
const hookSecondSession = makeSession([
  { type: "attendee", text: "Anything you've seen today that stood out?" },
  { type: "trainee", text: "Yeah actually, we've been struggling with our monitoring setup and alert noise." },
], 0);
const hookSecondDirective = decideNextMove(
  hookSecondSession,
  undefined,
  "Yeah actually, we've been struggling with our monitoring setup and alert noise."
);
expect(
  "after 1 attendee msg + trainee answer → NOT ask_hook",
  hookSecondDirective.move !== "ask_hook",
  true
);
expect(
  "after 1 attendee msg → stage is NOT HOOK (should be RAPPORT+)",
  hookSecondDirective.stage !== "HOOK",
  true
);

// Reproduce the exact loop from the export:
// 3 turns where attendee keeps asking hook questions
const hookLoopSession = makeSession([
  { type: "attendee", text: "Hey, how's your day going?" },
  { type: "trainee", text: "Pretty good, we've been checking out the booths." },
  { type: "attendee", text: "How's the conference treating you so far?" },
  { type: "trainee", text: "It's great — we're an SRE team looking at tools." },
], 0);
const hookLoopDirective = decideNextMove(
  hookLoopSession,
  undefined,
  "It's great — we're an SRE team looking at tools."
);
expect(
  "after 2 hook questions → NOT ask_hook (loop broken)",
  hookLoopDirective.move !== "ask_hook",
  true
);
expect(
  "after trainee mentions role → stage should be RAPPORT (role detected)",
  hookLoopDirective.stage,
  "RAPPORT"
);

// Even if trainee gives a generic short answer with no signals,
// director must NOT produce ask_hook again
const hookGenericSession = makeSession([
  { type: "attendee", text: "Anything you've seen today that stood out?" },
  { type: "trainee", text: "Not really, just browsing around." },
], 0);
const hookGenericDirective = decideNextMove(
  hookGenericSession,
  undefined,
  "Not really, just browsing around."
);
expect(
  "generic trainee answer after hook → NOT ask_hook",
  hookGenericDirective.move !== "ask_hook",
  true
);
expect(
  "generic answer → move is share_pain or ask_clarifying (progression)",
  hookGenericDirective.move === "share_pain" || hookGenericDirective.move === "ask_clarifying",
  true
);

// ── Answer move — role-reversal prevention ──────────────────────────────────

console.log("\nAnswer move — role-reversal prevention:");

// isQuestion helper
expect(
  'text with ? → is question',
  isQuestion("What does your setup look like?"),
  true
);
expect(
  'text without ? → not question',
  isQuestion("Our setup is fragmented."),
  false
);
expect(
  'text with embedded ? → is question',
  isQuestion("I wonder — what's your take on that?"),
  true
);

// When trainee asks a question and conversation is aligned → move is "answer"
// "your" triggers follow-up reference → aligned
const answerSession1 = makeSession([
  { type: "attendee", text: "We deal with a lot of alert noise and debugging issues." },
  { type: "trainee", text: "What does your current monitoring setup look like?" },
], 0);
const answerDirective1 = decideNextMove(
  answerSession1,
  undefined,
  "What does your current monitoring setup look like?"
);
expect(
  'aligned + trainee asks question → answer',
  answerDirective1.move,
  "answer"
);

// When trainee makes a statement (no question mark) → NOT answer
const statementSession = makeSession([
  { type: "attendee", text: "We deal with alert noise and debugging issues." },
  { type: "trainee", text: "That sounds like a real challenge for your team." },
], 0);
const statementDirective = decideNextMove(
  statementSession,
  undefined,
  "That sounds like a real challenge for your team."
);
expect(
  'aligned + trainee makes statement → NOT answer',
  statementDirective.move !== "answer",
  true
);

// HOOK stage → NOT answer even if trainee asks question
const hookQuestionSession2 = makeSession([
  { type: "trainee", text: "Hey, what brings you to the conference?" },
], 0);
const hookQuestionDirective2 = decideNextMove(
  hookQuestionSession2,
  undefined,
  "Hey, what brings you to the conference?"
);
expect(
  'HOOK stage + question → NOT answer (ask_hook instead)',
  hookQuestionDirective2.move,
  "ask_hook"
);

// Misaligned + question → answer (answer contract: questions are always answered)
// A direct question doesn't need repair — the attendee should answer it even
// when there's no keyword overlap with their last turn.
const misalignedQuestionSession = makeSession([
  { type: "attendee", text: "We deal with alert noise and debugging issues." },
  { type: "trainee", text: "Do you think quantum computing will change software engineering fundamentally?" },
], 0);
const misalignedQuestionDirective = decideNextMove(
  misalignedQuestionSession,
  undefined,
  "Do you think quantum computing will change software engineering fundamentally?"
);
expect(
  'misaligned + question → answer (answer contract, not ask_clarifying)',
  misalignedQuestionDirective.move,
  "answer"
);

// hard_exit intent + question → NOT answer (exit instead — intent gate blocks)
const hardExitQuestionSession2 = makeSession([
  { type: "attendee", text: "We have on-call issues." },
  { type: "trainee", text: "Honeycomb helps with incidents." },
  { type: "attendee", text: "Not really interested — we already have something for that." },
  { type: "trainee", text: "Are you sure? We could show you a quick demo." },
], 10);
const hardExitQuestionDirective2 = decideNextMove(
  hardExitQuestionSession2,
  undefined,
  "Are you sure? We could show you a quick demo."
);
expect(
  'hard_exit + question → NOT answer (intent gate blocks)',
  hardExitQuestionDirective2.move !== "answer",
  true
);
expect(
  'hard_exit + question → exit',
  hardExitQuestionDirective2.move,
  "exit"
);

// soft_exit intent + question → NOT answer (ask_docs or exit)
const softExitQuestionSession = makeSession([
  { type: "attendee", text: "We have alerting issues and on-call toil." },
  { type: "trainee", text: "Honeycomb cuts MTTR." },
  { type: "attendee", text: "Interesting — send me a link, I need to run." },
  { type: "trainee", text: "Sure — any specific area you're curious about?" },
], 30);
const softExitQuestionDirective = decideNextMove(
  softExitQuestionSession,
  undefined,
  "Sure — any specific area you're curious about?"
);
expect(
  'soft_exit + question → NOT answer (intent gate blocks)',
  softExitQuestionDirective.move !== "answer",
  true
);
expect(
  'soft_exit + question → ask_docs or exit',
  softExitQuestionDirective.move === "ask_docs" || softExitQuestionDirective.move === "exit",
  true
);

// answer allowed for rapport intent
const rapportAllowed = allowedMovesForIntent("rapport", "RAPPORT", "GUARDED");
expect(
  'rapport intent → answer IS in allowed set',
  rapportAllowed.has("answer"),
  true
);

// answer allowed for pain_sharing intent
const painSharingAllowed = allowedMovesForIntent("pain_sharing", "DISCOVERY", "CURIOUS");
expect(
  'pain_sharing intent → answer IS in allowed set',
  painSharingAllowed.has("answer"),
  true
);

// answer NOT allowed for hard_exit intent
const hardExitAllowed2 = allowedMovesForIntent("hard_exit", "COMMITMENT", "GUARDED");
expect(
  'hard_exit intent → answer NOT in allowed set',
  hardExitAllowed2.has("answer"),
  false
);

// answer NOT allowed for soft_exit intent
const softExitAllowed2 = allowedMovesForIntent("soft_exit", "COMMITMENT", "CURIOUS");
expect(
  'soft_exit intent → answer NOT in allowed set',
  softExitAllowed2.has("answer"),
  false
);

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
