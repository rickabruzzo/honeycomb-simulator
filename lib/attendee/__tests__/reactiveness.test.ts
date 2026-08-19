/**
 * Tests for lib/attendee/reactiveness.ts
 *
 * Covers:
 *  1. extractKeyPhrases — domain terms first, then generic long tokens
 *  2. isReactiveEnough — reflection marker / follow-up reference / keyphrase match
 *  3. isReactiveEnough — non-reactive baseline (no connection)
 *  4. makeCallbackPhrase — returns non-empty string, includes a domain term
 *
 * Run with:  npx tsx lib/attendee/__tests__/reactiveness.test.ts
 */

import {
  extractKeyPhrases,
  isReactiveEnough,
  makeCallbackPhrase,
} from "../reactiveness";

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

// ── 1. extractKeyPhrases ───────────────────────────────────────────────────────

console.log("\nextractKeyPhrases:");

const ep1 = extractKeyPhrases(
  "We're dealing with alert fatigue and slow debugging during incidents."
);
expectTrue(
  "finds domain term: alerting/alert",
  ep1.some((t) => t === "alert" || t === "alerting" || t === "alerts")
);
expectTrue(
  "finds domain term: debugging/debug",
  ep1.some((t) => t === "debug" || t === "debugging")
);
expectTrue(
  "finds domain term: incidents",
  ep1.some((t) => t === "incident" || t === "incidents")
);
expectTrue("returns at most 6 phrases", ep1.length <= 6);
expectTrue("returns at least 1 phrase", ep1.length >= 1);

const ep2 = extractKeyPhrases("Hey how are you doing today");
expectFalse("short generic text returns empty or minimal", ep2.length > 6);

const ep3 = extractKeyPhrases("We spend a lot of time on tracing and SLO compliance.");
expectTrue(
  "finds domain term: tracing",
  ep3.some((t) => t === "tracing" || t === "trace")
);
expectTrue(
  "finds domain term: slo",
  ep3.some((t) => t === "slo" || t === "slos")
);

// ── 2. isReactiveEnough — reactive cases ──────────────────────────────────────

console.log("\nisReactiveEnough — reactive cases:");

// Reflection marker
expectTrue(
  "reflection marker 'sounds like' → reactive",
  isReactiveEnough(
    "Sounds like you've really nailed the tracing workflow.",
    "We just shipped a new tracing pipeline last quarter."
  )
);

expectTrue(
  "reflection marker 'you mentioned' → reactive",
  isReactiveEnough(
    "You mentioned latency issues — that's exactly where we help.",
    "Our p99 latency has been climbing since the last deploy."
  )
);

expectTrue(
  "reflection marker 'it sounds' → reactive",
  isReactiveEnough(
    "It sounds like debugging is a real pain point for your team.",
    "We spend hours on each incident trying to figure out root cause."
  )
);

// Follow-up reference with 8+ word trainee message
expectTrue(
  "follow-up reference 'that' + 8-word trainee message → reactive",
  isReactiveEnough(
    "That's actually the problem we see most often in SRE teams.",
    "Our alerting generates so many false positives it's unusable."
  )
);

// Keyphrase match — trainee said "latency", candidate contains "latency"
expectTrue(
  "trainee keyphrase 'latency' in candidate → reactive",
  isReactiveEnough(
    "Yeah, we've seen that latency issue cause a lot of on-call pain.",
    "Our p99 latency spikes are causing incidents every week."
  )
);

// Keyphrase match — trainee said "tracing"
expectTrue(
  "trainee keyphrase 'tracing' in candidate → reactive",
  isReactiveEnough(
    "Tracing is what saves you during those moments.",
    "We added tracing but it's hard to make sense of the data."
  )
);

// Short trainee message — trivially reactive (nothing to react to)
expectTrue(
  "trainee text is empty → reactive by default",
  isReactiveEnough("We're dealing with a lot of alert fatigue.", "")
);

expectTrue(
  "trainee text is short (1 word) → reactive by default",
  isReactiveEnough("Interesting.", "Okay.")
);

// ── 3. isReactiveEnough — non-reactive cases ──────────────────────────────────

console.log("\nisReactiveEnough — non-reactive cases:");

// No shared terms, no reflection, no follow-up reference
expectFalse(
  "completely unrelated candidate → not reactive",
  isReactiveEnough(
    "Our product has a beautiful dashboard with many customization options.",
    "We spend hours debugging incidents and it is extremely painful."
  )
);

expectFalse(
  "generic CTA with no echo of trainee SRE terms → not reactive",
  isReactiveEnough(
    "We offer a free trial you can sign up for today.",
    "Our on-call rotation is causing serious alert fatigue for the team."
  )
);

// ── 4. makeCallbackPhrase ─────────────────────────────────────────────────────

console.log("\nmakeCallbackPhrase:");

const cb1 = makeCallbackPhrase(
  "We have a lot of alert fatigue on our on-call team.",
  "How are you currently handling alert noise?"
);
expectTrue("returns a non-empty string", cb1.length > 0);
expectTrue(
  "includes a domain term (alert/alerting/alerts or noise)",
  /alert|noise/i.test(cb1)
);

const cb2 = makeCallbackPhrase(
  "Our debugging cycles are painfully slow during incidents.",
  "What does your current tracing setup look like?"
);
expectTrue("returns non-empty string for tracing scenario", cb2.length > 0);
expectTrue(
  "includes 'tracing' or 'debug' domain term",
  /trac|debug/i.test(cb2)
);

const cb3 = makeCallbackPhrase("", "");
// Empty inputs — should return empty or non-crashing string
expectTrue(
  "empty inputs returns empty string (no crash)",
  typeof cb3 === "string"
);

// Determinism: same inputs → same output
const cb4a = makeCallbackPhrase(
  "We spend hours on incidents and debugging.",
  "That must be really painful for your on-call team."
);
const cb4b = makeCallbackPhrase(
  "We spend hours on incidents and debugging.",
  "That must be really painful for your on-call team."
);
expectTrue(
  "deterministic: same inputs produce same output",
  cb4a === cb4b
);

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
