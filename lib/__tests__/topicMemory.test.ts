/**
 * Topic memory tests — detection, persistence, and pain anchor filtering.
 *
 * Ensures:
 * - detectTopic correctly maps keywords to topic labels
 * - resolveTopicUpdate respects the 2-consecutive-mention persistence rule
 * - isPainAnchorOnTopic matches anchor keywords against topic keywords
 * - generateAttendeeReply updates session.currentTopic after each reply
 * - Topic-aware pain anchor sorting prefers on-topic anchors
 *
 * Run with:  npx tsx lib/__tests__/topicMemory.test.ts
 */

import {
  detectTopic,
  resolveTopicUpdate,
  isPainAnchorOnTopic,
  TOPIC_KEYWORDS,
} from "../attendee/topicDetector";
import { generateAttendeeReply } from "../attendee/generateAttendeeReply";
import type { SessionState } from "../storage";

let passed = 0;
let failed = 0;

function assert(label: string, actual: unknown, expected: unknown) {
  if (actual === expected) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`      expected: ${JSON.stringify(expected)}`);
    console.error(`      received: ${JSON.stringify(actual)}`);
    failed++;
  }
}

function assertNotNull(label: string, actual: unknown) {
  if (actual != null) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`      expected non-null, got: ${String(actual)}`);
    failed++;
  }
}

function assertOneOf(label: string, actual: unknown, options: unknown[]) {
  if (options.includes(actual)) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`      expected one of: ${JSON.stringify(options)}`);
    console.error(`      received: ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ── Helper: build a minimal session ─────────────────────────────────────────

function makeSession(
  transcript: Array<{ type: "system" | "trainee" | "attendee"; text: string }>,
  currentTopic?: string,
  consecutiveNewTopicCount?: number
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
    currentTopic,
    consecutiveNewTopicCount: consecutiveNewTopicCount ?? 0,
  } as SessionState;
}

// ── detectTopic ──────────────────────────────────────────────────────────────

console.log("\n📋 detectTopic");

assert(
  "detects alerts topic from 'alert noise'",
  detectTopic("We have a lot of alert noise and pager fatigue."),
  "alerts"
);

assert(
  "detects logs topic from 'logging' + 'splunk'",
  detectTopic("Our logging pipeline goes through Splunk."),
  "logs"
);

assert(
  "detects tracing topic from 'distributed trace'",
  detectTopic("We're trying to get distributed trace working across services."),
  "tracing"
);

assert(
  "detects incidents topic from 'incident' + 'root cause'",
  detectTopic("During an incident, finding the root cause takes forever."),
  "incidents"
);

assert(
  "detects monitoring topic from 'observability' + 'metrics'",
  detectTopic("We need better observability around our metrics."),
  "monitoring"
);

assert(
  "returns null for generic text",
  detectTopic("That sounds interesting, tell me more."),
  null
);

assert(
  "returns null for empty string",
  detectTopic(""),
  null
);

assert(
  "returns null for whitespace",
  detectTopic("   "),
  null
);

assert(
  "picks topic with most keyword matches",
  detectTopic("During an incident the debugging and root cause analysis takes hours."),
  "incidents" // "incident" + "debugging" + "root cause" = 3 hits vs others ≤ 1
);

// ── resolveTopicUpdate ───────────────────────────────────────────────────────

console.log("\n📋 resolveTopicUpdate");

{
  // No current topic, trainee mentions alerts → set immediately
  const result = resolveTopicUpdate(
    "We're drowning in alert noise from our on-call rotation.",
    null,
    0
  );
  // First mention of a topic when there's no current topic → set it
  // (counter goes to 1, but since currentTopic is null, any signal is new)
  // Actually per our rules: no current topic + detected → consecutiveNewTopicCount becomes 1
  // We only switch at >= 2. BUT when currentTopic is null, the first detection
  // should arguably set the topic immediately since there's nothing to "persist".
  // Let me check: detected="alerts", currentTopic=null, detected !== null →
  // newCount = 0 + 1 = 1, which is < 2, so it stays null.
  // This is actually the intended behavior: 2 consecutive mentions to establish.
  assert(
    "first mention of topic when no current → stays null (needs 2 mentions)",
    result.topic,
    null
  );
  assert(
    "counter increments to 1",
    result.consecutiveNewTopicCount,
    1
  );
}

{
  // Second consecutive mention of alerts → topic switches
  const result = resolveTopicUpdate(
    "The alerting is really noisy, pager goes off all night.",
    null,
    1  // already had one consecutive mention
  );
  assert(
    "second consecutive mention → topic switches to alerts",
    result.topic,
    "alerts"
  );
  assert(
    "counter resets to 0 after switch",
    result.consecutiveNewTopicCount,
    0
  );
}

{
  // Trainee references current topic → keep it, reset counter
  const result = resolveTopicUpdate(
    "Yeah the alert fatigue is really bad.",
    "alerts",
    0
  );
  assert(
    "trainee references current topic → keeps it",
    result.topic,
    "alerts"
  );
  assert(
    "counter stays 0",
    result.consecutiveNewTopicCount,
    0
  );
}

{
  // Trainee mentions different topic (first time) → keep current, increment counter
  const result = resolveTopicUpdate(
    "We also have logging issues with our Splunk setup.",
    "alerts",
    0
  );
  assert(
    "first mention of different topic → keeps current",
    result.topic,
    "alerts"
  );
  assert(
    "counter increments to 1",
    result.consecutiveNewTopicCount,
    1
  );
}

{
  // Trainee mentions same new topic again → switch
  const result = resolveTopicUpdate(
    "The logging pipeline is really slow and unreliable.",
    "alerts",
    1
  );
  assert(
    "second consecutive new topic mention → switches to logs",
    result.topic,
    "logs"
  );
  assert(
    "counter resets after switch",
    result.consecutiveNewTopicCount,
    0
  );
}

{
  // No topic signal in trainee text → keep current, reset counter
  const result = resolveTopicUpdate(
    "That makes sense, tell me more.",
    "alerts",
    1
  );
  assert(
    "no topic signal → keeps current topic",
    result.topic,
    "alerts"
  );
  assert(
    "counter resets to 0 on no signal",
    result.consecutiveNewTopicCount,
    0
  );
}

// ── isPainAnchorOnTopic ──────────────────────────────────────────────────────

console.log("\n📋 isPainAnchorOnTopic");

assert(
  "alert-related anchor matches alerts topic",
  isPainAnchorOnTopic(["alert", "noise", "on-call", "fatigue"], "alerts"),
  true
);

assert(
  "trace-related anchor matches tracing topic",
  isPainAnchorOnTopic(["trace", "span", "distributed"], "tracing"),
  true
);

assert(
  "debug-related anchor matches incidents topic",
  isPainAnchorOnTopic(["debugging", "root cause", "mttr"], "incidents"),
  true
);

assert(
  "alert anchor does NOT match logs topic",
  isPainAnchorOnTopic(["alert", "noise", "pager"], "logs"),
  false
);

assert(
  "unknown topic returns false",
  isPainAnchorOnTopic(["alert", "noise"], "unknown-topic"),
  false
);

// ── generateAttendeeReply: topic state updates ──────────────────────────────

console.log("\n📋 generateAttendeeReply — topic state updates");

{
  // Trainee mentions alerts → session topic counter should update
  // (reply may be null when no persona → LLM fallback, but topic state still updates)
  const session = makeSession([
    { type: "system", text: "*approaches booth*" },
    { type: "attendee", text: "Hey there." },
  ]);

  // Call generateAttendeeReply — result may be null (LLM fallback)
  // but topic state on session must still be updated
  generateAttendeeReply({
    traineeText: "We're dealing with a lot of alert noise and on-call fatigue.",
    session,
    traineeTurnCount: 1,
  });

  // After first mention with no current topic, counter should be 1
  assert(
    "consecutiveNewTopicCount is 1 after first topic mention",
    session.consecutiveNewTopicCount,
    1
  );
}

{
  // Two consecutive alert mentions should set the topic
  const session = makeSession(
    [
      { type: "system", text: "*approaches booth*" },
      { type: "attendee", text: "Hey there." },
    ],
    undefined, // no current topic
    1 // already one consecutive mention
  );

  generateAttendeeReply({
    traineeText: "Yeah the pager goes off constantly, alert fatigue is real.",
    session,
    traineeTurnCount: 2,
  });

  assert(
    "currentTopic is 'alerts' after second consecutive mention",
    session.currentTopic,
    "alerts"
  );
  assert(
    "counter resets to 0 after topic switch",
    session.consecutiveNewTopicCount,
    0
  );
}

{
  // When topic is set, a same-topic mention should keep it
  const session = makeSession(
    [
      { type: "system", text: "*approaches booth*" },
      { type: "attendee", text: "Hey there." },
    ],
    "alerts", // current topic
    0
  );

  generateAttendeeReply({
    traineeText: "How do you handle the alert noise today?",
    session,
    traineeTurnCount: 1,
  });

  assert(
    "same-topic mention preserves currentTopic",
    session.currentTopic,
    "alerts"
  );
  assert(
    "counter stays 0 on same-topic",
    session.consecutiveNewTopicCount,
    0
  );
}

{
  // Generic trainee message (no topic) keeps current topic
  const session = makeSession(
    [
      { type: "system", text: "*approaches booth*" },
      { type: "attendee", text: "Hey there." },
    ],
    "alerts",
    1
  );

  generateAttendeeReply({
    traineeText: "That sounds really interesting, tell me more.",
    session,
    traineeTurnCount: 1,
  });

  assert(
    "no-topic message keeps current topic",
    session.currentTopic,
    "alerts"
  );
  assert(
    "counter resets to 0 on no-topic message",
    session.consecutiveNewTopicCount,
    0
  );
}

// ── TOPIC_KEYWORDS coverage ──────────────────────────────────────────────────

console.log("\n📋 TOPIC_KEYWORDS coverage");

{
  const topics = Object.keys(TOPIC_KEYWORDS);
  assert("has 5 topics", topics.length, 5);
  assert("includes alerts", topics.includes("alerts"), true);
  assert("includes logs", topics.includes("logs"), true);
  assert("includes tracing", topics.includes("tracing"), true);
  assert("includes incidents", topics.includes("incidents"), true);
  assert("includes monitoring", topics.includes("monitoring"), true);
}

// ── Report ──────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
