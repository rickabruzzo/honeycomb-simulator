/**
 * Regression tests: attendee confusion should penalize trainee scores.
 *
 * When the attendee repeatedly expresses confusion, it reflects poorly on the
 * trainee's communication. Penalties:
 *  - confusionCount >= 2: listening -5
 *  - confusionCount >= 3: overall -5
 *
 * Run with:  npx tsx lib/__tests__/scoring.confusionPenalty.test.ts
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

// ── Baseline: no confusion → no penalty ──────────────────────────────────────

console.log("\nBaseline (no confusion):");

const baselineSession = makeSession([
  { type: "attendee", text: "We have a lot of alert noise." },
  { type: "trainee", text: "ok" },
]);
const baselineResult = heuristicScore(baselineSession, "baseline-token");
const baselineListening = baselineResult.breakdown.listening;
const baselineScore = baselineResult.score;

assert(
  "baseline listening = 5 (base, no phrases)",
  baselineListening,
  5
);

// ── Scenario A: 2 confusion messages → listening -5 ─────────────────────────

console.log("\nScenario A (2 confusion messages):");

const twoConfusionSession = makeSession([
  { type: "attendee", text: "We have a lot of alert noise." },
  { type: "trainee", text: "Our data lakes provide insights." },
  { type: "attendee", text: "I'm not sure how that connects — can you clarify?" },
  { type: "trainee", text: "We also do machine learning pipelines." },
  { type: "attendee", text: "Wait, I'm lost. How does that relate to what I just mentioned?" },
  { type: "trainee", text: "sure" },
]);
const twoConfusionResult = heuristicScore(twoConfusionSession, "two-confusion-token");

assert(
  "2 confusion messages → listening reduced by 5 (5 - 5 = 0)",
  twoConfusionResult.breakdown.listening,
  0
);

// Overall score should NOT have the extra -5 (that's only for >= 3)
// Six 0-20 dims: listening(0) discovery(0) empathy(2) qualification(8 floor)
//   guardrails(20) handoff(6, UNKNOWN outcome) = 36; round(36/120*100) = 30.
assert(
  "2 confusion messages → overall score = 30 (no extra -5 for overall)",
  twoConfusionResult.score,
  30
);

// ── Scenario B: 3 confusion messages → listening -5 AND overall -5 ──────────

console.log("\nScenario B (3 confusion messages):");

const threeConfusionSession = makeSession([
  { type: "attendee", text: "We have a lot of alert noise." },
  { type: "trainee", text: "Our data lakes are great." },
  { type: "attendee", text: "I'm not sure how that connects — can you clarify?" },
  { type: "trainee", text: "We do machine learning." },
  { type: "attendee", text: "I'm not following — can you explain?" },
  { type: "trainee", text: "And data pipelines." },
  { type: "attendee", text: "Can you try again? I'm still lost." },
  { type: "trainee", text: "sure" },
]);
const threeConfusionResult = heuristicScore(threeConfusionSession, "three-confusion-token");

assert(
  "3 confusion messages → listening reduced by 5 (5 - 5 = 0)",
  threeConfusionResult.breakdown.listening,
  0
);

// Six 0-20 dims: listening(0) discovery(0) empathy(2) qualification(8) guardrails(20)
//   handoff(6) = 36; round(36/120*100) = 30. Then -5 for confusionCount >= 3 → 25.
assert(
  "3 confusion messages → overall score = 25 (extra -5 for severe confusion)",
  threeConfusionResult.score,
  25
);

// ── Scenario C: 1 confusion message → NO penalty ────────────────────────────

console.log("\nScenario C (1 confusion message):");

const oneConfusionSession = makeSession([
  { type: "attendee", text: "We have a lot of alert noise." },
  { type: "trainee", text: "Our data lakes are great." },
  { type: "attendee", text: "I'm not sure how that connects — can you clarify?" },
  { type: "trainee", text: "ok" },
]);
const oneConfusionResult = heuristicScore(oneConfusionSession, "one-confusion-token");

assert(
  "1 confusion message → listening NOT reduced (still 5)",
  oneConfusionResult.breakdown.listening,
  5
);

// ── Summary ────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
