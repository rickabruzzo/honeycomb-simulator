/**
 * Tool-question answering tests.
 *
 * Verifies that when the trainee asks a direct tool/stack question, the
 * attendee replies with concrete tool names — not generic pain statements.
 *
 * Root failure this fixes:
 *   Trainee: "What are you using alongside ELK when an incident hits?"
 *   Attendee: "Honestly, ELK works okay day-to-day, but under pressure during
 *              an incident it slows us down."  ← WRONG (pain, not tools)
 *
 * Correct behavior after fix:
 *   Attendee: "We're using ELK, Prometheus, and PagerDuty, and during
 *              incidents we're usually bouncing between them."  ← CORRECT
 *
 * Run with:  npx tsx lib/__tests__/toolQuestionAnswering.test.ts
 */

import { generateAttendeeReply } from "../attendee/generateAttendeeReply";
import type { SessionState } from "../storage";
import type { Persona } from "../scenarioTypes";

let passed = 0;
let failed = 0;

function assert(label: string, actual: unknown, expected: unknown) {
  if (actual === expected) {
    console.log(`  \u2713 ${label}`);
    passed++;
  } else {
    console.error(`  \u2717 ${label}`);
    console.error(`      expected: ${JSON.stringify(expected)}`);
    console.error(`      received: ${JSON.stringify(actual)}`);
    failed++;
  }
}

function assertNotNull(label: string, actual: unknown) {
  if (actual != null) {
    console.log(`  \u2713 ${label}`);
    passed++;
  } else {
    console.error(`  \u2717 ${label}`);
    console.error(`      expected non-null, received: ${String(actual)}`);
    failed++;
  }
}

function assertContainsTool(label: string, text: string, ...toolVariants: string[]) {
  const lower = text.toLowerCase();
  const found = toolVariants.some((t) => lower.includes(t.toLowerCase()));
  if (found) {
    console.log(`  \u2713 ${label}`);
    passed++;
  } else {
    console.error(`  \u2717 ${label}`);
    console.error(`      expected one of: ${JSON.stringify(toolVariants)}`);
    console.error(`      received: ${JSON.stringify(text)}`);
    failed++;
  }
}

function assertNoPainLanguage(label: string, text: string) {
  const PAIN_PATTERNS = [
    /biggest challenge/i,
    /struggling with/i,
    /hard part is/i,
    /slows us down/i,
    /alert noise/i,
    /on-call fatigue/i,
  ];
  const matched = PAIN_PATTERNS.find((p) => p.test(text));
  if (!matched) {
    console.log(`  \u2713 ${label}`);
    passed++;
  } else {
    console.error(`  \u2717 ${label}`);
    console.error(`      unexpected pain language matched: ${matched}`);
    console.error(`      in text: ${JSON.stringify(text)}`);
    failed++;
  }
}

function makeSession(
  transcript: Array<{ type: "system" | "trainee" | "attendee"; text: string }>,
  overrides?: Partial<SessionState>
): SessionState {
  return {
    id: "test-session",
    currentState: "CONVERSATION",
    stateHistory: [],
    transcript: transcript.map((m, i) => ({
      id: `msg-${i}`,
      type: m.type,
      text: m.text,
      timestamp: new Date().toISOString(),
    })),
    violations: [],
    kickoff: {
      attendeeProfile: "Persona: SRE\nModifiers: time-constrained\nEmotional posture: curious",
    },
    startTime: new Date().toISOString(),
    active: true,
    ...overrides,
  } as SessionState;
}

const PERSONA_WITH_ELK: Partial<Persona> = {
  personaType: "SRE",
  toolStackOptions: [
    { variant: "ELK + Prometheus + PagerDuty", tools: ["ELK", "Prometheus", "PagerDuty"] },
    { variant: "Datadog + Splunk", tools: ["Datadog", "Splunk"] },
  ],
} as any;

// ── Test A: persona toolStackOptions — alongside question ─────────────────────

console.log("\nTest A: persona toolStackOptions — alongside / incident question");

{
  const session = makeSession(
    [
      { type: "system", text: "*approaches booth*" },
      { type: "attendee", text: "Yeah we have some monitoring pain during incidents." },
      { type: "trainee", text: "Tell me more." },
      { type: "attendee", text: "Alert correlation is rough." },
    ],
    { persona: PERSONA_WITH_ELK as Persona, currentTools: ["elk"] }
  );

  const result = generateAttendeeReply({
    traineeText: "What are you using alongside ELK when an incident hits?",
    session,
    traineeTurnCount: 3,
  });

  assertNotNull("A) produces a reply", result);
  if (result) {
    // Must name at least one tool
    assertContainsTool(
      "A) reply names a tool from the ELK stack",
      result.text,
      "ELK", "Prometheus", "PagerDuty", "Datadog", "Splunk"
    );
    // Must be a statement
    assert("A) reply is a statement (no trailing ?)", result.text.endsWith("?"), false);
    // Must not be generic pain
    assertNoPainLanguage("A) reply has no generic pain language", result.text);
  }
}

// ── Test B: session.currentTools — explicit tool list in answer ───────────────

console.log("\nTest B: session.currentTools drives the answer");

{
  const session = makeSession(
    [
      { type: "system", text: "*approaches booth*" },
      { type: "attendee", text: "We use ELK, Prometheus, and PagerDuty." },
      { type: "trainee", text: "Nice." },
      { type: "attendee", text: "Yeah, it's a decent stack." },
    ],
    { currentTools: ["elk", "prometheus", "pagerduty"] }
  );

  const result = generateAttendeeReply({
    traineeText: "What tools are in the mix today?",
    session,
    traineeTurnCount: 3,
  });

  assertNotNull("B) produces a reply", result);
  if (result) {
    assertContainsTool("B) reply mentions ELK", result.text, "ELK", "elk");
    assertContainsTool("B) reply mentions Prometheus", result.text, "Prometheus", "prometheus");
    assertContainsTool("B) reply mentions PagerDuty", result.text, "PagerDuty", "pagerduty");
    assert("B) reply is a statement", result.text.endsWith("?"), false);
    assertNoPainLanguage("B) no pain language", result.text);
  }
}

// ── Test C: no persona tools, no session tools — generic named fallback ────────

console.log("\nTest C: no tools anywhere — generic concrete named fallback");

{
  const session = makeSession([
    { type: "system", text: "*approaches booth*" },
    { type: "attendee", text: "We have some monitoring pain." },
    { type: "trainee", text: "That sounds rough." },
    { type: "attendee", text: "Yeah it is." },
  ]);

  const result = generateAttendeeReply({
    traineeText: "What tools are you using?",
    session,
    traineeTurnCount: 3,
  });

  assertNotNull("C) produces a reply", result);
  if (result) {
    // Generic fallback must name real tools (ELK, Prometheus, PagerDuty, Grafana, etc.)
    const hasRealTool =
      /\b(ELK|Prometheus|PagerDuty|Grafana|Datadog|Splunk|CloudWatch|Loki)\b/i.test(result.text);
    assert("C) generic fallback contains named tools", hasRealTool, true);
    assert("C) reply is a statement", result.text.endsWith("?"), false);
    assertNoPainLanguage("C) no pain language in generic fallback", result.text);
  }
}

// ── Test D: non-tool question — pain-detail routing still works ───────────────

console.log("\nTest D: non-tool question — pain-detail routing preserved");

{
  const session = makeSession(
    [
      { type: "system", text: "*approaches booth*" },
      { type: "attendee", text: "We have debugging pain." },
      { type: "trainee", text: "Tell me more." },
      { type: "attendee", text: "It slows us down a lot." },
    ],
    { currentTools: ["elk", "prometheus"] }
  );

  const result = generateAttendeeReply({
    traineeText: "Where does it usually slow down?",
    session,
    traineeTurnCount: 3,
  });

  assertNotNull("D) produces a reply for pain-detail question", result);
  if (result) {
    // Should describe a breakdown/slowdown, not enumerate tools
    const describesPain =
      /\b(slow|break|incident|service|correlat|figure out|data|scattered|root cause|hardest|biggest gap)\b/i.test(
        result.text
      );
    assert("D) reply describes a breakdown (not pure tool list)", describesPain, true);
    assert("D) reply is a statement", result.text.endsWith("?"), false);
  }
}

// ── Test E: regression — tool question must not fall through to pain anchors ──

console.log("\nTest E: regression — tool question cannot produce unrelated pain");

{
  const SRE_PERSONA_WITH_ANCHORS: Partial<Persona> = {
    personaType: "SRE",
    toolStackOptions: [
      { variant: "Prometheus + Grafana", tools: ["Prometheus", "Grafana"] },
    ],
    painAnchors: [
      {
        id: "alert-noise",
        pain: "How do I minimize alert fatigue on my on-call team?",
        keywords: ["alert", "noise", "fatigue"],
        priority: "primary",
      },
    ],
  } as any;

  const session = makeSession(
    [
      { type: "system", text: "*approaches booth*" },
      { type: "attendee", text: "We have some tooling pain." },
    ],
    { persona: SRE_PERSONA_WITH_ANCHORS as Persona }
  );

  // Run 4 variants to check no pain-anchor leakage across traineeTurnCount values
  const painAnchorPhrases = [
    "alert fatigue",
    "minimize alert",
    "on-call team",
  ];

  let leakCount = 0;
  for (let i = 0; i < 4; i++) {
    const result = generateAttendeeReply({
      traineeText: "What tools are you using for monitoring?",
      session: {
        ...session,
        transcript: [...session.transcript],
      },
      traineeTurnCount: i,
    });
    if (result) {
      const hasPainLeak = painAnchorPhrases.some((phrase) =>
        result.text.toLowerCase().includes(phrase)
      );
      if (hasPainLeak) {
        leakCount++;
        console.error(`      [turn ${i}] pain anchor leaked into tool answer: "${result.text}"`);
      }
    }
  }
  assert("E) pain anchor never leaks into tool-question answers (4 turns)", leakCount, 0);
}

// ── Test F: TOOL_ENUM_Q_RE does not over-match process/pain questions ──────────

console.log("\nTest F: TOOL_ENUM_Q_RE does not steal non-tool questions");

{
  const toolQuestions = [
    "What tools are you using?",
    "What are you using alongside ELK?",
    "What's in the mix today?",
    "What does your stack look like?",
    "What are you running for logs?",
    "What are you relying on right now?",
  ];

  const nonToolQuestions = [
    "Where does it usually slow down?",
    "How do you debug an incident?",
    "What's the biggest challenge with your setup?",
    "How does your on-call process work?",
  ];

  // Rough check: tool questions should produce answers with tool-name patterns
  for (const q of toolQuestions) {
    const session = makeSession(
      [{ type: "system", text: "*approaches booth*" }, { type: "attendee", text: "We have some monitoring pain." }],
      { currentTools: ["elk", "prometheus"] }
    );
    const result = generateAttendeeReply({ traineeText: q, session, traineeTurnCount: 1 });
    const hasTool = result ? /\b(ELK|Prometheus|Grafana|Splunk|Datadog|PagerDuty)\b/i.test(result.text) : false;
    assert(`F) tool question routes to tool answer: "${q.slice(0, 40)}"`, hasTool, true);
  }

  // Non-tool questions should NOT produce pure tool enumerations
  for (const q of nonToolQuestions) {
    const session = makeSession(
      [{ type: "system", text: "*approaches booth*" }, { type: "attendee", text: "We have debugging pain." }],
      { currentTools: ["elk", "prometheus"] }
    );
    const result = generateAttendeeReply({ traineeText: q, session, traineeTurnCount: 1 });
    // For non-tool questions, result should describe a process or breakdown, not just list tools
    // (We can only assert it doesn't look like a pure "We're using X right now." enumeration)
    const isPureEnum = result
      ? /^(we're using|right now it's|our stack is|we've got .* in the mix)$/i.test(
          result.text.replace(/[.,!]$/, "").toLowerCase()
        )
      : false;
    assert(`F) non-tool question does NOT produce pure enumeration: "${q.slice(0, 40)}"`, isPureEnum, false);
  }
}

// ── Report ───────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
