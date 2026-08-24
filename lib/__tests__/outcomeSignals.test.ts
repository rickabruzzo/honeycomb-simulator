/**
 * Tests for lib/attendee/outcomeSignals.ts
 *
 * Run with:  npx tsx lib/__tests__/outcomeSignals.test.ts
 */

import {
  detectOutcomeFromText,
  detectOutcomeFromTranscript,
  outcomeSignalToCommittedOutcome,
  type OutcomeSignalType,
} from "../attendee/outcomeSignals";

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

// ── detectOutcomeFromText ────────────────────────────────────────────────────

console.log("\ndetectOutcomeFromText:");

expect(
  '"Can you scan my badge?" → BADGE_SCAN',
  detectOutcomeFromText("Can you scan my badge?"),
  "BADGE_SCAN"
);

expect(
  '"Could someone follow up with me?" → BADGE_SCAN',
  detectOutcomeFromText("Could someone follow up with me?"),
  "BADGE_SCAN"
);

expect(
  '"book a call" → BADGE_SCAN',
  detectOutcomeFromText("Can we book a call?"),
  "BADGE_SCAN"
);

// ── Authority / budget → BADGE_SCAN ("numbers = in charge of numbers") ──────
expect(
  '"what does it cost per seat" → BADGE_SCAN',
  detectOutcomeFromText("Roughly what does it cost per seat?"),
  "BADGE_SCAN"
);

expect(
  '"get budget approved" → BADGE_SCAN',
  detectOutcomeFromText("I'd need to get budget approved first."),
  "BADGE_SCAN"
);

expect(
  '"roll this out to my team" → BADGE_SCAN',
  detectOutcomeFromText("I want to roll this out to my whole team."),
  "BADGE_SCAN"
);

expect(
  '"I manage the platform team" → BADGE_SCAN',
  detectOutcomeFromText("I manage the platform team here."),
  "BADGE_SCAN"
);

expect(
  '"pricing for our org" → BADGE_SCAN',
  detectOutcomeFromText("What's the pricing for our org?"),
  "BADGE_SCAN"
);

expect(
  '"is there a free tier" is NOT authority (must not become BADGE_SCAN)',
  detectOutcomeFromText("Is there a free tier I can try?"),
  "NONE"
);

expect(
  '"Can you show me a quick demo?" → DEMO',
  detectOutcomeFromText("Can you show me a quick demo?"),
  "DEMO"
);

expect(
  '"walk me through it" → DEMO',
  detectOutcomeFromText("Walk me through the product"),
  "DEMO"
);

expect(
  '"I\'ll check it out" → FLYER (apostrophe stripped to space)',
  detectOutcomeFromText("I'll check it out on my own"),
  "FLYER"
);

expect(
  '"sign up for the free tier" → FLYER',
  detectOutcomeFromText("Where can I sign up for the free tier?"),
  "FLYER"
);

expect(
  '"send me the docs" → FLYER',
  detectOutcomeFromText("Just send me the docs"),
  "FLYER"
);

expect(
  'unrelated text → NONE',
  detectOutcomeFromText("That's interesting, tell me more."),
  "NONE"
);

// ── detectOutcomeFromTranscript ──────────────────────────────────────────────

console.log("\ndetectOutcomeFromTranscript:");

expect(
  "empty transcript → NONE",
  detectOutcomeFromTranscript([]),
  "NONE"
);

expect(
  "DEMO message in transcript → DEMO",
  detectOutcomeFromTranscript([
    { type: "trainee", text: "So what makes Honeycomb different?" },
    { type: "attendee", text: "Can you show me a quick demo?" },
  ]),
  "DEMO"
);

// BADGE_SCAN should win over an earlier DEMO
expect(
  "BADGE_SCAN after DEMO → BADGE_SCAN (priority wins)",
  detectOutcomeFromTranscript([
    { type: "attendee", text: "Can you show me a quick demo?" },
    { type: "trainee", text: "Sure! Let me pull that up." },
    { type: "attendee", text: "Actually, can you scan my badge for a follow-up?" },
  ]),
  "BADGE_SCAN"
);

// FLYER is the only signal
expect(
  "FLYER-only transcript → FLYER",
  detectOutcomeFromTranscript([
    { type: "attendee", text: "Just send me the docs, I'll read later." },
  ]),
  "FLYER"
);

// System messages should be ignored
expect(
  "system messages excluded from scan",
  detectOutcomeFromTranscript([
    { type: "system", text: "Can you scan my badge?" }, // system — should be ignored
    { type: "trainee", text: "Welcome to the booth!" },
  ]),
  "NONE"
);

// DEMO beats FLYER
expect(
  "DEMO beats FLYER in same window",
  detectOutcomeFromTranscript([
    { type: "attendee", text: "I'll check it out on my own" },
    { type: "attendee", text: "Actually, walk me through the product." },
  ]),
  "DEMO"
);

// ── outcomeSignalToCommittedOutcome ──────────────────────────────────────────

console.log("\noutcomeSignalToCommittedOutcome:");

expect(
  "BADGE_SCAN → MQL_READY",
  outcomeSignalToCommittedOutcome("BADGE_SCAN"),
  "MQL_READY"
);

expect(
  "DEMO → DEMO_READY",
  outcomeSignalToCommittedOutcome("DEMO"),
  "DEMO_READY"
);

expect(
  "FLYER → SELF_SERVICE_READY",
  outcomeSignalToCommittedOutcome("FLYER"),
  "SELF_SERVICE_READY"
);

expect(
  "NONE → null",
  outcomeSignalToCommittedOutcome("NONE"),
  null
);

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
