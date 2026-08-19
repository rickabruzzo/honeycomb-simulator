/**
 * Discovery-question filter tests.
 *
 * Ensures:
 * - isDiscoveryQuestion detects sales-discovery patterns
 * - isDiscoveryQuestion allows evaluation questions through
 * - generateAttendeeReply replaces discovery questions with evaluation questions
 *
 * Run with:  npx tsx lib/__tests__/questionFilter.test.ts
 */

import {
  isDiscoveryQuestion,
  EVALUATION_QUESTIONS,
} from "../attendee/questionFilter";
import { generateAttendeeReply } from "../attendee/generateAttendeeReply";
import type { SessionState } from "../storage";

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
    console.error(`      expected non-null, got: ${String(actual)}`);
    failed++;
  }
}

// ── isDiscoveryQuestion — should detect ──────────────────────────────────────

console.log("\n\ud83d\udccb isDiscoveryQuestion \u2014 should detect");

assert(
  "detects 'How does your team handle alerts today?'",
  isDiscoveryQuestion("How does your team handle alerts today?"),
  true
);

assert(
  "detects 'What tools do you use for monitoring?'",
  isDiscoveryQuestion("What tools do you use for monitoring?"),
  true
);

assert(
  "detects 'How are you handling incidents right now?'",
  isDiscoveryQuestion("How are you handling incidents right now?"),
  true
);

assert(
  "detects 'How do you handle on-call rotation?'",
  isDiscoveryQuestion("How do you handle on-call rotation?"),
  true
);

assert(
  "detects 'What does your process look like?'",
  isDiscoveryQuestion("What does your process look like?"),
  true
);

assert(
  "detects 'What's your approach to debugging?'",
  isDiscoveryQuestion("What's your approach to debugging?"),
  true
);

assert(
  "detects 'How do you currently handle that?'",
  isDiscoveryQuestion("How do you currently handle that?"),
  true
);

assert(
  "detects 'Tell me about how you debug incidents?'",
  isDiscoveryQuestion("Tell me about how you debug incidents?"),
  true
);

assert(
  "detects 'What are you using for tracing?'",
  isDiscoveryQuestion("What are you using for tracing?"),
  true
);

assert(
  "detects 'How long have you been using Splunk?'",
  isDiscoveryQuestion("How long have you been using Splunk?"),
  true
);

// ── isDiscoveryQuestion — should allow ───────────────────────────────────────

console.log("\n\ud83d\udccb isDiscoveryQuestion \u2014 should allow");

assert(
  "allows 'How would that help reduce alert noise?'",
  isDiscoveryQuestion("How would that help reduce alert noise?"),
  false
);

assert(
  "allows 'Would that replace our alerting setup?'",
  isDiscoveryQuestion("Would that replace our alerting setup?"),
  false
);

assert(
  "allows 'How hard would it be to roll out?'",
  isDiscoveryQuestion("How hard would it be to roll out?"),
  false
);

assert(
  "allows 'Does it work alongside existing monitoring tools?'",
  isDiscoveryQuestion("Does it work alongside existing monitoring tools?"),
  false
);

assert(
  "allows 'How does it help during a real incident?'",
  isDiscoveryQuestion("How does it help during a real incident?"),
  false
);

assert(
  "allows 'Can you show me a quick demo?'",
  isDiscoveryQuestion("Can you show me a quick demo?"),
  false
);

assert(
  "allows 'What's the pricing model?'",
  isDiscoveryQuestion("What's the pricing model?"),
  false
);

assert(
  "allows statements (no question mark)",
  isDiscoveryQuestion("How does your team handle that today."),
  false
);

assert(
  "allows empty string",
  isDiscoveryQuestion(""),
  false
);

// ── generateAttendeeReply — discovery question replacement ──────────────────

console.log("\n\ud83d\udccb generateAttendeeReply \u2014 discovery question replacement");

function makeSession(
  transcript: Array<{ type: "system" | "trainee" | "attendee"; text: string }>
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
      attendeeProfile:
        "Persona: SRE\nModifiers: time-constrained\nEmotional posture: guarded",
    },
    startTime: new Date().toISOString(),
    active: true,
  } as SessionState;
}

{
  // When the generator would produce a discovery question (via cooperative
  // clarifier), it should be replaced with an evaluation question.
  // We can test this indirectly: a session where ask_clarifying would fire
  // and the cooperative clarifier picks a discovery-style template.
  //
  // Since the cooperative clarifiers include "how does your team handle that today?",
  // we verify that the output never matches a discovery pattern.

  const session = makeSession([
    { type: "system", text: "*approaches booth looking interested*" },
    { type: "attendee", text: "Hey, pretty good day so far. We're looking at observability tools." },
    { type: "trainee", text: "Nice! What kind of monitoring challenges are you facing?" },
    { type: "attendee", text: "We've got a lot of alert noise and incidents take forever to debug." },
  ]);

  // Generate several replies to increase chance of hitting a discovery clarifier
  let discoveryFound = false;
  for (let turn = 0; turn < 10; turn++) {
    // Clone session for each iteration to avoid state accumulation
    const testSession = makeSession([
      { type: "system", text: "*approaches booth looking interested*" },
      { type: "attendee", text: "Hey, pretty good day so far. We're looking at observability tools." },
      { type: "trainee", text: "Nice! What kind of monitoring challenges are you facing?" },
      { type: "attendee", text: "We've got a lot of alert noise and incidents take forever to debug." },
    ]);

    const result = generateAttendeeReply({
      traineeText: "That sounds tough. Tell me more about your alerting setup.",
      session: testSession,
      traineeTurnCount: turn,
    });

    if (result && isDiscoveryQuestion(result.text)) {
      discoveryFound = true;
      console.error(`      Discovery question leaked: "${result.text}"`);
      break;
    }
  }

  assert(
    "no discovery questions leak through after filtering (10 turns)",
    discoveryFound,
    false
  );
}

{
  // Evaluation questions should pass through unchanged
  const evalQ = EVALUATION_QUESTIONS[0]; // "How would something like that help reduce the alert noise?"
  assert(
    "evaluation question bank entries are not flagged as discovery",
    isDiscoveryQuestion(evalQ),
    false
  );
}

{
  // Verify all evaluation bank entries are allowed
  let allAllowed = true;
  for (const q of EVALUATION_QUESTIONS) {
    if (isDiscoveryQuestion(q)) {
      console.error(`      Evaluation question wrongly flagged: "${q}"`);
      allAllowed = false;
    }
  }
  assert(
    "all EVALUATION_QUESTIONS pass isDiscoveryQuestion check",
    allAllowed,
    true
  );
}

// ── Report ──────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
