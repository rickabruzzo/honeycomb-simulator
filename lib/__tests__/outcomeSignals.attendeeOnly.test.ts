/**
 * Regression tests: outcome detection must be attendee-only.
 * Trainee text must never trigger a CTA outcome signal.
 *
 * Run with:  npx tsx lib/__tests__/outcomeSignals.attendeeOnly.test.ts
 */

import {
  detectOutcomeFromTranscript,
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

// ── Core attendee-only regression ───────────────────────────────────────────

console.log("\nAttendee-only outcome detection:");

// Bug regression: trainee says "scan my badge" — MUST NOT detect outcome
expect(
  'trainee "Want me to scan your badge?" → NONE (trainee text ignored)',
  detectOutcomeFromTranscript([
    { type: "attendee", text: "What does Honeycomb do?" },
    { type: "trainee", text: "Want me to scan your badge?" },
  ]),
  "NONE"
);

// The positive case: attendee says "can you scan my badge?" — MUST detect
expect(
  'attendee "can you scan my badge?" → BADGE_SCAN',
  detectOutcomeFromTranscript([
    { type: "attendee", text: "This sounds good—can you scan my badge?" },
  ]),
  "BADGE_SCAN"
);

// Trainee pastes an attendee-style phrase — MUST NOT detect
expect(
  'trainee "I\'ll check it out on my own" → NONE (trainee text ignored)',
  detectOutcomeFromTranscript([
    { type: "attendee", text: "Is there a free tier?" },
    { type: "trainee", text: "I'll check it out on my own" },
  ]),
  "NONE"
);

// Trainee says "show me a demo" — MUST NOT detect
expect(
  'trainee "Can I show you a quick demo?" → NONE (trainee text ignored)',
  detectOutcomeFromTranscript([
    { type: "attendee", text: "Tell me more about query building." },
    { type: "trainee", text: "Can I show you a quick demo?" },
  ]),
  "NONE"
);

// Trainee does pitch-style badge request — MUST NOT detect
expect(
  'trainee "Can I scan your badge?" → NONE (trainee text ignored)',
  detectOutcomeFromTranscript([
    { type: "attendee", text: "That sounds interesting." },
    { type: "trainee", text: "Can I scan your badge so someone can follow up?" },
  ]),
  "NONE"
);

// Trainee-only transcript with strong phrases — MUST NOT detect
expect(
  'trainee-only strong phrases → NONE',
  detectOutcomeFromTranscript([
    { type: "trainee", text: "Can you scan my badge?" },
    { type: "trainee", text: "Walk me through the product" },
    { type: "trainee", text: "Sign up for the free tier" },
  ]),
  "NONE"
);

// ── Mixed transcripts — attendee signal survives ─────────────────────────────

console.log("\nAttendee signal survives alongside trainee noise:");

// Attendee signal present despite trainee saying badge-scan phrase
expect(
  'attendee asks for demo; trainee separately mentions badge → DEMO (attendee wins)',
  detectOutcomeFromTranscript([
    { type: "attendee", text: "Can you walk me through the product?" },
    { type: "trainee", text: "I can scan your badge for you." },
  ]),
  "DEMO"
);

// Attendee signal with system messages around it
expect(
  'attendee badge scan with surrounding system messages → BADGE_SCAN',
  detectOutcomeFromTranscript([
    { type: "system", text: "Session started" },
    { type: "trainee", text: "Hi! What brings you by?" },
    { type: "attendee", text: "This is cool—can you scan my badge?" },
    { type: "system", text: "Turn limit approaching" },
  ]),
  "BADGE_SCAN"
);

// Only system + trainee — no attendee — MUST be NONE
expect(
  'only system + trainee messages → NONE',
  detectOutcomeFromTranscript([
    { type: "system", text: "Session started" },
    { type: "trainee", text: "Can you scan my badge?" },
    { type: "trainee", text: "Show me a demo." },
  ]),
  "NONE"
);

// ── Priority ordering still works ───────────────────────────────────────────

console.log("\nPriority ordering (attendee-only):");

expect(
  'attendee FLYER then attendee BADGE_SCAN → BADGE_SCAN wins',
  detectOutcomeFromTranscript([
    { type: "attendee", text: "Send me the docs." },
    { type: "trainee", text: "Sure!" },
    { type: "attendee", text: "Actually, can you scan my badge?" },
  ]),
  "BADGE_SCAN"
);

expect(
  'attendee FLYER only → FLYER',
  detectOutcomeFromTranscript([
    { type: "attendee", text: "Just send me the links." },
  ]),
  "FLYER"
);

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
