/**
 * Integration tests for the Continuity Contract.
 *
 * These tests verify end-to-end continuity enforcement across realistic
 * conversation scenarios — combining extractAnchors, makeContextualCallback,
 * isReactiveEnough, and enforceContinuity.
 *
 * Run with:  npx tsx lib/attendee/__tests__/continuityContract.test.ts
 */

import { enforceContinuity } from "../reactiveness";

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

function expectTrue(label: string, actual: boolean) {
  expect(label, actual, true);
}

function expectFalse(label: string, actual: boolean) {
  expect(label, actual, false);
}

// ── 1. Datadog pain → docs bridge ───────────────────────────────────────────

console.log("\n1. Datadog pain → docs bridge:");

const s1 = enforceContinuity(
  "Do you have docs I can check out?",
  {
    lastTraineeText:
      "We're using Datadog but root cause analysis is painfully slow for our team.",
    lastAttendeeText:
      "Sounds like debugging incidents takes a while for you.",
    intent: "evaluating_fit",
    stage: "VALUE",
    move: "ask_docs",
  }
);

expectTrue(
  "output is different from input (prefix was added)",
  s1 !== "Do you have docs I can check out?"
);
// The trainee mentioned Datadog-related pain; the bridge should reference a
// domain term from either the trainee or attendee context
expectTrue(
  "output still includes the docs request",
  /docs/i.test(s1)
);

// ── 2. Alert fatigue → docs bridge ──────────────────────────────────────────

console.log("\n2. Alert fatigue → docs bridge:");

const s2 = enforceContinuity(
  "Is there a free tier I could try before committing?",
  {
    lastTraineeText:
      "Our alerting system generates way too many false positives and noise for the on-call team.",
    lastAttendeeText:
      "Yeah, alert fatigue is one of the biggest complaints we hear.",
    intent: "evaluating_fit",
    stage: "VALUE",
    move: "ask_docs",
  }
);

expectTrue(
  "output is different from input (prefix was added)",
  s2 !== "Is there a free tier I could try before committing?"
);
expectTrue(
  "bridge references alert-related term",
  /alert/i.test(s2)
);
expectTrue(
  "output still includes the tier/try request",
  /tier|try/i.test(s2)
);

// ── 3. Confused intent → empathetic prefix (no scolding) ───────────────────

console.log("\n3. Confused intent → empathetic prefix (no scolding):");

const s3 = enforceContinuity(
  "We have a beautiful dashboard you can customize.",
  {
    lastTraineeText:
      "We're struggling with slow debugging during incidents and our monitoring is unreliable.",
    lastAttendeeText:
      "What does your current setup look like?",
    intent: "confused",
    stage: "DISCOVERY",
    move: "share_pain",
  }
);

expectTrue(
  "confused prefix was added (output differs from input)",
  s3 !== "We have a beautiful dashboard you can customize."
);
expectFalse(
  "no scolding language in output",
  /(sorry|not sure|got lost|not following|try again|how does that relate)/i.test(s3)
);
expectTrue(
  "output references a domain term (slow/debug/incident/monitoring)",
  /slow|debug|incident|monitoring/i.test(s3)
);

// ── 4. Already reactive → no double prefix ──────────────────────────────────

console.log("\n4. Already reactive → no double prefix:");

const alreadyReactive =
  "Sounds like your alerting workflow needs a lot of manual triage.";
const s4 = enforceContinuity(alreadyReactive, {
  lastTraineeText:
    "Our alerting creates so many false positives we can't trust it.",
  lastAttendeeText:
    "Tell me more about your on-call experience.",
  intent: "pain_sharing",
  stage: "DISCOVERY",
  move: "share_pain",
});

expectTrue(
  "already reactive text passes through unchanged",
  s4 === alreadyReactive
);

// ── 5. Soft exit + ask_docs → bridge prefix ─────────────────────────────────

console.log("\n5. Soft exit + ask_docs → bridge prefix:");

const s5 = enforceContinuity(
  "Can you send me some links to look at later?",
  {
    lastTraineeText:
      "We're drowning in incident toil and our SLOs are slipping badly this quarter.",
    lastAttendeeText:
      "That's a tough spot to be in with the team.",
    intent: "soft_exit",
    stage: "COMMITMENT",
    move: "ask_docs",
  }
);

expectTrue(
  "soft_exit + ask_docs gets bridge prefix",
  s5 !== "Can you send me some links to look at later?"
);
expectTrue(
  "bridge prefix references a pain term (incident/toil/slo)",
  /incident|toil|slo/i.test(s5)
);
expectTrue(
  "output still includes the links/look request",
  /links|look/i.test(s5)
);

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(
  `\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`
);
if (failed > 0) process.exit(1);
