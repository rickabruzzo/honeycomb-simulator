/**
 * Tests for lib/attendee/ctaGating.ts
 *
 * Verifies:
 *  - Explicit badge-scan/demo CTA requires minimum depth (>= 2 attendee, >= 4 total)
 *  - Flyer CTA requires more depth + ENGAGED momentum
 *  - Fallback (no explicit outcome) requires COMMITTED + deeper conversation
 *  - Empty/tiny transcripts never trigger CTA
 *
 * Run with:  npx tsx lib/__tests__/ctaGating.test.ts
 */

import { shouldShowCTA } from "../attendee/ctaGating";

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

// ── BADGE_SCAN depth gating ──────────────────────────────────────────────────

console.log("\nBADGE_SCAN depth gating:");

// 1 attendee + 3 total → false (needs >= 2 attendee, >= 4 total)
expect(
  "badge scan + 1 attendee + 3 total messages → false (depth too low)",
  shouldShowCTA({
    outcomeType: "BADGE_SCAN",
    momentumScore: 0,
    transcript: [
      { type: "trainee",  text: "Hello!" },
      { type: "attendee", text: "Can you scan my badge?" },
      { type: "trainee",  text: "Sure!" },
    ],
  }),
  false
);

// 2 attendee + 4 total → true
expect(
  "badge scan + 2 attendee + 4 total messages → true",
  shouldShowCTA({
    outcomeType: "BADGE_SCAN",
    momentumScore: 0,
    transcript: [
      { type: "trainee",  text: "Hello!" },
      { type: "attendee", text: "What does Honeycomb do?" },
      { type: "trainee",  text: "We make observability tools." },
      { type: "attendee", text: "Can you scan my badge?" },
    ],
  }),
  true
);

// 2 attendee + 3 total → false (total count not met: needs >= 4)
expect(
  "badge scan + 2 attendee + 3 total messages → false (need >= 4 total)",
  shouldShowCTA({
    outcomeType: "BADGE_SCAN",
    momentumScore: 0,
    transcript: [
      { type: "attendee", text: "What do you do?" },
      { type: "trainee",  text: "We make observability tools." },
      { type: "attendee", text: "Can you scan my badge?" },
    ],
  }),
  false
);

// ── DEMO depth gating ────────────────────────────────────────────────────────

console.log("\nDEMO depth gating:");

expect(
  "demo + 1 attendee + 2 total → false",
  shouldShowCTA({
    outcomeType: "DEMO",
    momentumScore: 20,
    transcript: [
      { type: "trainee",  text: "Hi!" },
      { type: "attendee", text: "Can you walk me through the product?" },
    ],
  }),
  false
);

expect(
  "demo + 2 attendee + 4 total → true",
  shouldShowCTA({
    outcomeType: "DEMO",
    momentumScore: 20,
    transcript: [
      { type: "trainee",  text: "Hi!" },
      { type: "attendee", text: "Interesting, tell me more." },
      { type: "trainee",  text: "We surface traces and spans for fast debugging." },
      { type: "attendee", text: "Can you walk me through the product?" },
    ],
  }),
  true
);

// ── FLYER depth + momentum gating ───────────────────────────────────────────

console.log("\nFLYER depth + momentum gating:");

// 2 attendee + 6 total but momentum CURIOUS → false
expect(
  "flyer + 2 attendee + 6 total + CURIOUS momentum → false (needs ENGAGED)",
  shouldShowCTA({
    outcomeType: "FLYER",
    momentumScore: 20, // CURIOUS band
    transcript: [
      { type: "trainee",  text: "Hi!" },
      { type: "attendee", text: "What do you do?" },
      { type: "trainee",  text: "We make observability tools." },
      { type: "attendee", text: "Interesting." },
      { type: "trainee",  text: "Here's more info." },
      { type: "attendee", text: "Just send me the docs." },
    ],
  }),
  false
);

// 2 attendee + 6 total + ENGAGED momentum → true
expect(
  "flyer + 2 attendee + 6 total + ENGAGED momentum → true",
  shouldShowCTA({
    outcomeType: "FLYER",
    momentumScore: 40, // ENGAGED band
    transcript: [
      { type: "trainee",  text: "Hi!" },
      { type: "attendee", text: "What do you do?" },
      { type: "trainee",  text: "We make observability tools." },
      { type: "attendee", text: "Interesting." },
      { type: "trainee",  text: "Here's more info." },
      { type: "attendee", text: "Just send me the docs." },
    ],
  }),
  true
);

// 1 attendee + 5 total + ENGAGED → false (not enough attendee messages)
expect(
  "flyer + 1 attendee + 5 total + ENGAGED → false (needs >= 2 attendee)",
  shouldShowCTA({
    outcomeType: "FLYER",
    momentumScore: 40,
    transcript: [
      { type: "trainee", text: "Hi!" },
      { type: "trainee", text: "We do observability." },
      { type: "trainee", text: "Here is a use case." },
      { type: "trainee", text: "Any thoughts?" },
      { type: "attendee", text: "Just send me the docs." },
    ],
  }),
  false
);

// ── Fallback (no explicit outcome) ──────────────────────────────────────────

console.log("\nFallback (no explicit outcome):");

// COMMITTED band but too shallow → false
expect(
  "fallback + COMMITTED + 2 attendee + 4 total → false (needs >= 3 attendee, >= 8 total)",
  shouldShowCTA({
    outcomeType: "NONE",
    momentumScore: 60,
    transcript: [
      { type: "trainee",  text: "Hi, can I show you a demo?" },
      { type: "attendee", text: "Sure, go ahead." },
      { type: "trainee",  text: "Here's how it works." },
      { type: "attendee", text: "Interesting, I'd like to follow up." },
    ],
  }),
  false
);

// Build a deep COMMITTED transcript with keyword
const deepCommittedTranscript = [
  { type: "trainee" as const,  text: "Hi!" },
  { type: "attendee" as const, text: "What do you do?" },
  { type: "trainee" as const,  text: "We make observability tools." },
  { type: "attendee" as const, text: "Interesting, our team deals with this." },
  { type: "trainee" as const,  text: "How do you handle incidents?" },
  { type: "attendee" as const, text: "It's slow, lots of log digging." },
  { type: "trainee" as const,  text: "We have a better approach." },
  { type: "attendee" as const, text: "I'd like to follow up on this." },
];

expect(
  "fallback + COMMITTED + 4 attendee + 8 total + 'follow up' keyword → true",
  shouldShowCTA({
    outcomeType: "NONE",
    momentumScore: 60,
    transcript: deepCommittedTranscript,
  }),
  true
);

// ENGAGED band (not COMMITTED) with deep transcript → false
expect(
  "fallback + ENGAGED band (score 40) + deep transcript + keyword → false (needs COMMITTED)",
  shouldShowCTA({
    outcomeType: "NONE",
    momentumScore: 40, // ENGAGED — below COMMITTED threshold of 51
    transcript: deepCommittedTranscript,
  }),
  false
);

// NONE outcome, COMMITTED, deep but no keyword → false
expect(
  "fallback + COMMITTED + deep transcript but no commitment keyword → false",
  shouldShowCTA({
    outcomeType: "NONE",
    momentumScore: 60,
    transcript: [
      { type: "trainee",  text: "Hi!" },
      { type: "attendee", text: "What do you do?" },
      { type: "trainee",  text: "We make observability tools." },
      { type: "attendee", text: "Sounds interesting." },
      { type: "trainee",  text: "How do you handle incidents?" },
      { type: "attendee", text: "It's slow." },
      { type: "trainee",  text: "We can help." },
      { type: "attendee", text: "Good to know." },
    ],
  }),
  false
);

// ── Empty / minimal transcripts never trigger ────────────────────────────────

console.log("\nEdge cases:");

expect(
  "empty transcript → false",
  shouldShowCTA({ outcomeType: "NONE", momentumScore: 100, transcript: [] }),
  false
);

expect(
  "badge scan + empty transcript → false (no depth)",
  shouldShowCTA({ outcomeType: "BADGE_SCAN", momentumScore: 0, transcript: [] }),
  false
);

expect(
  "badge scan + 1 attendee + 1 total → false",
  shouldShowCTA({
    outcomeType: "BADGE_SCAN",
    momentumScore: 0,
    transcript: [{ type: "attendee", text: "Can you scan my badge?" }],
  }),
  false
);

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
