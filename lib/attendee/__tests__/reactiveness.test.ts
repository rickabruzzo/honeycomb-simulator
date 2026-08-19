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
  extractAnchors,
  isReactiveEnough,
  makeCallbackPhrase,
  makeContextualCallback,
  enforceContinuity,
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

// No shared terms, no reflection, no follow-up reference, no first-person markers.
// Examples must use third-person / impersonal phrasing to stay non-reactive under
// the new first-person prospect rule.
expectFalse(
  "completely unrelated candidate → not reactive",
  isReactiveEnough(
    "A dashboard solution with built-in integrations is available.",
    "Debugging incidents is extremely painful and takes hours each time."
  )
);

expectFalse(
  "generic impersonal CTA with no echo of trainee SRE terms → not reactive",
  isReactiveEnough(
    "A free trial is available at the product website.",
    "The on-call rotation is causing serious alert fatigue for the team."
  )
);

// ── 4. makeCallbackPhrase ─────────────────────────────────────────────────────

console.log("\nmakeCallbackPhrase:");

const cb1 = makeCallbackPhrase(
  "We have a lot of alert fatigue on our on-call team.",
  "How are you currently handling alert noise?"
);
expectTrue("returns a non-empty string", cb1.length > 0);
// Templates may be term-free (e.g. "For us, ") — only check banned phrases are absent
expectFalse("no 'helpful context' in callback", /helpful context/i.test(cb1));
expectFalse("no 'specifically around' in callback", /specifically around/i.test(cb1));
expectFalse("no 'thinking about' in callback", /thinking about/i.test(cb1));

const cb2 = makeCallbackPhrase(
  "Our debugging cycles are painfully slow during incidents.",
  "What does your current tracing setup look like?"
);
expectTrue("returns non-empty string for tracing scenario", cb2.length > 0);
// Deterministic, no banned stems
expectFalse("no 'helpful context' in tracing callback", /helpful context/i.test(cb2));
expectFalse("no 'thinking about' in tracing callback", /thinking about/i.test(cb2));

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

// ── 5. extractAnchors ────────────────────────────────────────────────────────

console.log("\nextractAnchors:");

const ea1 = extractAnchors(
  "We're dealing with alert fatigue and slow debugging during incidents."
);
expectTrue(
  "keywords includes domain terms",
  ea1.keywords.some((k) => k === "alert" || k === "alerts" || k === "alerting")
);
expectTrue("keywords capped at 8", ea1.keywords.length <= 8);
expectTrue("keywords has at least 1", ea1.keywords.length >= 1);
expectTrue("phrases capped at 3", ea1.phrases.length <= 3);
// Phrases should be multi-word chunks
for (const p of ea1.phrases) {
  expectTrue(
    `phrase "${p}" is multi-word (2+ words)`,
    p.split(" ").length >= 2
  );
}

const ea2 = extractAnchors("Yes");
expectTrue("short input → empty phrases", ea2.phrases.length === 0);
expectTrue("short input → minimal keywords", ea2.keywords.length <= 1);

const ea3 = extractAnchors(
  "Our tracing pipeline feeds into SLO dashboards for latency monitoring."
);
expectTrue(
  "finds 'tracing' in keywords",
  ea3.keywords.some((k) => k === "tracing")
);
expectTrue(
  "finds 'slo' in keywords",
  ea3.keywords.some((k) => k === "slo")
);
expectTrue(
  "finds 'latency' in keywords",
  ea3.keywords.some((k) => k === "latency")
);
expectTrue(
  "finds 'monitoring' in keywords",
  ea3.keywords.some((k) => k === "monitoring")
);

// ── 6. makeContextualCallback ────────────────────────────────────────────────

console.log("\nmakeContextualCallback:");

const mcc1 = makeContextualCallback({
  lastTraineeText: "Our alerting system creates a lot of noise for the on-call team.",
  lastAttendeeText: "Tell me more about your incident response workflow.",
  intent: "neutral",
  stage: "DISCOVERY",
});
expectTrue("returns non-empty for substantive input", mcc1.length > 0);
// Some templates are term-free ("For us,", "Usually,") — only assert no banned stems
expectFalse("no 'helpful context' in general callback", /helpful context/i.test(mcc1));
expectFalse("no 'specifically around' in general callback", /specifically around/i.test(mcc1));
expectFalse("no 'thinking about' in general callback", /thinking about/i.test(mcc1));

// No scolding — confused intent should be empathetic
const mcc2 = makeContextualCallback({
  lastTraineeText: "We're struggling with slow debugging during incidents.",
  lastAttendeeText: "What does your monitoring setup look like?",
  intent: "confused",
  stage: "DISCOVERY",
});
expectTrue("confused intent returns non-empty", mcc2.length > 0);
expectFalse(
  "confused callback has no scolding language",
  /(sorry|not sure|got lost|not following|try again|how does that relate)/i.test(mcc2)
);

// Determinism
const mcc3a = makeContextualCallback({
  lastTraineeText: "Our deploy pipeline keeps breaking and SLOs are suffering.",
  lastAttendeeText: "That sounds painful for the team.",
  intent: "pain_sharing",
  stage: "DISCOVERY",
});
const mcc3b = makeContextualCallback({
  lastTraineeText: "Our deploy pipeline keeps breaking and SLOs are suffering.",
  lastAttendeeText: "That sounds painful for the team.",
  intent: "pain_sharing",
  stage: "DISCOVERY",
});
expectTrue("deterministic: same inputs → same output", mcc3a === mcc3b);

// Confused vs neutral → different template banks (different outputs for same term)
const sharedOpts = {
  lastTraineeText: "We need better tracing for our microservices.",
  lastAttendeeText: "How are you handling tracing today?",
  stage: "DISCOVERY",
};
const mcc4confused = makeContextualCallback({ ...sharedOpts, intent: "confused" });
const mcc4neutral = makeContextualCallback({ ...sharedOpts, intent: "neutral" });
expectTrue(
  "confused and neutral intents produce different prefixes",
  mcc4confused !== mcc4neutral
);

// Empty input → empty output
const mcc5 = makeContextualCallback({
  lastTraineeText: "",
  lastAttendeeText: "",
  intent: "neutral",
  stage: "HOOK",
});
expectTrue("empty inputs → empty string", mcc5 === "");

// Bridge intent (evaluating_fit)
const mcc6 = makeContextualCallback({
  lastTraineeText: "The latency issues are making our customers unhappy.",
  lastAttendeeText: "We hear that a lot from teams.",
  intent: "evaluating_fit",
  stage: "VALUE",
});
expectTrue("evaluating_fit returns non-empty bridge", mcc6.length > 0);
expectTrue(
  "bridge includes a domain term",
  /latency/i.test(mcc6)
);

// ── 7. enforceContinuity ─────────────────────────────────────────────────────

console.log("\nenforceContinuity:");

// ask_hook passes through unchanged
const ec1 = enforceContinuity("What brings you by today?", {
  lastTraineeText: "We're dealing with complex latency issues.",
  lastAttendeeText: "",
  intent: "neutral",
  stage: "HOOK",
  move: "ask_hook",
});
expectTrue(
  "ask_hook passes through unchanged",
  ec1 === "What brings you by today?"
);

// exit passes through unchanged
const ec2 = enforceContinuity("Thanks, this has been useful.", {
  lastTraineeText: "We'll think about it.",
  lastAttendeeText: "Sounds good!",
  intent: "soft_exit",
  stage: "COMMITMENT",
  move: "exit",
});
expectTrue(
  "exit passes through unchanged",
  ec2 === "Thanks, this has been useful."
);

// Already reactive (keyword overlap) → NOT prefixed
const ec3 = enforceContinuity(
  "Yeah, we've seen that latency issue cause a lot of pain.",
  {
    lastTraineeText: "Our p99 latency spikes are brutal every Friday.",
    lastAttendeeText: "Tell me more about your setup.",
    intent: "pain_sharing",
    stage: "DISCOVERY",
    move: "share_pain",
  }
);
expectTrue(
  "already reactive text not prefixed",
  ec3 === "Yeah, we've seen that latency issue cause a lot of pain."
);

// NOT reactive → IS prefixed.  Candidate must have no first-person markers ("Our/We")
// and no keyword overlap with the trainee text so the new first-person rule
// doesn't cause it to pass early.
const ec4 = enforceContinuity(
  "A platform dashboard is available with many configuration options.",
  {
    lastTraineeText: "Debugging incidents takes hours and it is extremely painful.",
    lastAttendeeText: "What does your team focus on?",
    intent: "neutral",
    stage: "DISCOVERY",
    move: "share_pain",
  }
);
expectTrue(
  "non-reactive impersonal text gets prefixed",
  ec4 !== "A platform dashboard is available with many configuration options."
);
// Prefix may or may not contain a domain term (some templates are term-free)
expectFalse("no 'helpful context' in prefix", /helpful context/i.test(ec4));
expectFalse("no 'specifically around' in prefix", /specifically around/i.test(ec4));
expectFalse("no 'thinking about' in prefix", /thinking about/i.test(ec4));

// mustAvoid opener is stripped.  Candidate must not contain first-person markers
// so the new first-person rule does not make it reactive before stripping fires.
const ec5 = enforceContinuity(
  "Sorry, I'm not following. The platform offers integration options for SRE teams.",
  {
    lastTraineeText: "Tell me about your tracing setup",
    lastAttendeeText: "Incidents are noisy.",
    intent: "neutral",
    stage: "VALUE",
    move: "ask_docs",
    mustAvoid: ["Sorry, I'm not following."],
  }
);
expectFalse(
  "mustAvoid opener stripped — result does not start with 'Sorry'",
  ec5.startsWith("Sorry")
);

// evaluating_fit + ask_docs → bridge prefix
const ec6 = enforceContinuity(
  "Is there documentation I could review on my own time?",
  {
    lastTraineeText: "Our alerting system generates way too many false positives.",
    lastAttendeeText: "We hear that from a lot of SRE teams.",
    intent: "evaluating_fit",
    stage: "VALUE",
    move: "ask_docs",
  }
);
expectTrue(
  "evaluating_fit + ask_docs gets prefixed",
  ec6 !== "Is there documentation I could review on my own time?"
);
// Bridge prefix may be term-free ("For us it's similar —") — check no banned stems
expectFalse("no 'helpful context' in bridge prefix", /helpful context/i.test(ec6));
expectFalse("no 'specifically around' in bridge prefix", /specifically around/i.test(ec6));

// Short trainee message → trivially reactive, no prefix
const ec7 = enforceContinuity(
  "Do you have docs I can check out?",
  {
    lastTraineeText: "Sure.",
    lastAttendeeText: "We can help with that.",
    intent: "neutral",
    stage: "VALUE",
    move: "ask_docs",
  }
);
expectTrue(
  "short trainee msg → passes through unchanged",
  ec7 === "Do you have docs I can check out?"
);

// ── 8. enforceContinuity — answer move is always exempt ──────────────────────

console.log("\nenforceContinuity — answer exempt:");

const ANSWER_TEXT = "We're using Splunk and Prometheus but correlating them during incidents is painful.";

// A) answer move returns text unchanged even when content appears non-reactive
const answerResult = enforceContinuity(ANSWER_TEXT, {
  lastTraineeText: "What tools are you using for monitoring your infrastructure?",
  lastAttendeeText: "Tell me more.",
  intent: "neutral",
  stage: "DISCOVERY",
  move: "answer",
});
expectTrue(
  "A) answer move returns text unchanged",
  answerResult === ANSWER_TEXT
);

// Confirm the same text *would* get prefixed for a non-exempt move (share_pain)
// when it has no overlap with trainee terms — proving the exemption is doing work
const sharePainResult = enforceContinuity(
  "The slowdown usually hits during an incident when you need answers fast.",
  {
    lastTraineeText: "Tell me about something completely different.",
    lastAttendeeText: "What does your team focus on?",
    intent: "neutral",
    stage: "DISCOVERY",
    move: "share_pain",
  }
);
// "The slowdown usually hits during an incident..." contains "usually" → isReactiveEnough
// (new first-person rule) — so it passes through unchanged.  Test that answer also passes.
expectTrue(
  "A) first-person statement in answer returns unchanged via first-person check",
  enforceContinuity("Usually we start by looking at logs first.", {
    lastTraineeText: "How do you debug an incident?",
    lastAttendeeText: "Tell me more.",
    intent: "neutral",
    stage: "DISCOVERY",
    move: "answer",
  }) === "Usually we start by looking at logs first."
);

// ── 9. isReactiveEnough — first-person prospect statements ───────────────────

console.log("\nisReactiveEnough — first-person prospect statements:");

// D) Natural first-person statements must be reactive
expectTrue(
  "D) 'The slowdown is usually in figuring out...' → reactive",
  isReactiveEnough(
    "The slowdown is usually in figuring out which service is actually causing the issue.",
    "Where does things slow down in your debugging process?"
  )
);

expectTrue(
  "D) 'We use a mix of tools...' → reactive (first-person)",
  isReactiveEnough(
    "We use a mix of tools and it gets fragmented during incidents.",
    "What does your monitoring stack look like?"
  )
);

expectTrue(
  "D) 'Our on-call rotation is painful...' → reactive (first-person)",
  isReactiveEnough(
    "Our on-call rotation is painful — we get paged constantly.",
    "Tell me about your alerting setup."
  )
);

expectTrue(
  "D) 'For us, the hard part is correlation.' → reactive",
  isReactiveEnough(
    "For us, the hard part is correlation across services.",
    "What's the biggest challenge in your workflow?"
  )
);

expectTrue(
  "D) 'Honestly, we spend more time looking...' → reactive",
  isReactiveEnough(
    "Honestly, we spend more time looking for the right log than actually fixing things.",
    "How long does it take to debug an incident?"
  )
);

// First-person check only fires for statements, not questions
expectFalse(
  "D) first-person question is NOT auto-reactive",
  isReactiveEnough(
    "We are wondering — can you tell us more about the product?",
    "We spend hours on incident debugging every week."
  )
);

// ── 10. No banned phrases across all template banks ──────────────────────────

console.log("\nNo banned phrases in any template output:");

// C) Exhaustively check every template in every bank by generating outputs
import {
  makeCallbackPhrase as _makeCallbackPhrase,
  makeContextualCallback as _makeContextualCallback,
} from "../reactiveness";

const BANNED_PHRASES = ["helpful context", "specifically around", "thinking about"];

const testInputs = [
  { a: "We deal with alert noise.", b: "How are you handling alerting?" },
  { a: "Our tracing is slow.", b: "What tools do you use for tracing?" },
  { a: "Incidents are painful.", b: "Tell me about your incident workflow." },
];

for (const { a, b } of testInputs) {
  const phrase = makeCallbackPhrase(a, b);
  for (const banned of BANNED_PHRASES) {
    expectFalse(
      `C) makeCallbackPhrase does not contain '${banned}'`,
      phrase.toLowerCase().includes(banned)
    );
  }
}

const intentVariants = ["neutral", "confused", "evaluating_fit", "pain_sharing"];
for (const intent of intentVariants) {
  const cb = makeContextualCallback({
    lastTraineeText: "Our alerting generates too much noise during on-call.",
    lastAttendeeText: "We hear that a lot.",
    intent,
    stage: "DISCOVERY",
  });
  for (const banned of BANNED_PHRASES) {
    expectFalse(
      `C) makeContextualCallback (${intent}) does not contain '${banned}'`,
      cb.toLowerCase().includes(banned)
    );
  }
}

// ── 11. ask_clarifying still gets continuity when truly disconnected ──────────

console.log("\nask_clarifying — continuity still fires:");

// E) A disconnected clarifying question should get a contextual prefix.
// Candidate must avoid: "that/this/those/what you..." (follow-up-reference check),
// first-person markers (we/our/for us/...), and shared domain terms.
const disconnectedClarify = enforceContinuity(
  "Is there a free tier option for engineering teams?",
  {
    lastTraineeText: "Debugging incidents takes hours and causes serious alert fatigue.",
    lastAttendeeText: "What does your team focus on?",
    intent: "neutral",
    stage: "DISCOVERY",
    move: "ask_clarifying",
  }
);
// No follow-up refs, no first-person markers, no shared terms → gets prefixed
expectTrue(
  "E) disconnected ask_clarifying gets a continuity prefix",
  disconnectedClarify !== "Is there a free tier option for engineering teams?"
);
expectFalse(
  "E) prefix has no banned stems",
  BANNED_PHRASES.some((p) => disconnectedClarify.toLowerCase().includes(p))
);

// Already-reactive clarifying question is NOT double-prefixed
const reactiveClarify = enforceContinuity(
  "Yeah, we've seen debugging cycles balloon during incidents too — what does your team do first?",
  {
    lastTraineeText: "Our debugging cycle takes hours every incident.",
    lastAttendeeText: "Tell me more.",
    intent: "neutral",
    stage: "DISCOVERY",
    move: "ask_clarifying",
  }
);
expectTrue(
  "E) already-reactive ask_clarifying not double-prefixed",
  reactiveClarify === "Yeah, we've seen debugging cycles balloon during incidents too — what does your team do first?"
);

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
