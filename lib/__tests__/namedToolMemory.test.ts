/**
 * Named tool memory tests — detection, session persistence, and concrete answers.
 *
 * Ensures:
 * - detectNamedTools identifies tools from the catalog
 * - isToolDomainQuestion detects tool-domain questions
 * - decideNextMove returns move="answer" + toolAnchored when tools named + concrete question
 * - decideNextMove blocks abstract re-clarification with named tools
 * - generateAttendeeReply includes tool names in answers (first-person, no "?")
 * - Repair (misaligned) still works even when tools are named
 * - Tool memory update scans attendee messages and persists to session.currentTools
 *
 * Run with:  npx tsx lib/__tests__/namedToolMemory.test.ts
 */

import {
  detectNamedTools,
  isToolDomainQuestion,
  decideNextMove,
} from "../attendee/conversationDirector";
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

function assertIncludes(label: string, haystack: string, needle: string) {
  if (haystack.toLowerCase().includes(needle.toLowerCase())) {
    console.log(`  \u2713 ${label}`);
    passed++;
  } else {
    console.error(`  \u2717 ${label}`);
    console.error(`      expected to include: ${JSON.stringify(needle)}`);
    console.error(`      received: ${JSON.stringify(haystack)}`);
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
      attendeeProfile:
        "Persona: SRE\nModifiers: time-constrained\nEmotional posture: guarded",
    },
    startTime: new Date().toISOString(),
    active: true,
    ...overrides,
  } as SessionState;
}

// ── detectNamedTools ─────────────────────────────────────────────────────────

console.log("\n\ud83d\udccb detectNamedTools \u2014 identification");

{
  const tools = detectNamedTools("We use Splunk for logs and Prometheus for metrics.");
  assert("detects splunk", tools.includes("splunk"), true);
  assert("detects prometheus", tools.includes("prometheus"), true);
  assert("returns 2 tools", tools.length, 2);
}

{
  const tools = detectNamedTools("Our ELK stack handles most of our logging.");
  assert("detects elk", tools.includes("elk"), true);
}

{
  const tools = detectNamedTools("We've been looking at Datadog and New Relic.");
  assert("detects datadog", tools.includes("datadog"), true);
  assert("detects new relic", tools.includes("new relic"), true);
}

{
  const tools = detectNamedTools("Not really using any specific tool for that.");
  assert("returns empty for no tools", tools.length, 0);
}

{
  const tools = detectNamedTools("We have Grafana dashboards and a Jaeger setup for tracing.");
  assert("detects grafana", tools.includes("grafana"), true);
  assert("detects jaeger", tools.includes("jaeger"), true);
}

{
  const tools = detectNamedTools("");
  assert("returns empty for empty string", tools.length, 0);
}

// ── isToolDomainQuestion ─────────────────────────────────────────────────────

console.log("\n\ud83d\udccb isToolDomainQuestion \u2014 detection");

assert(
  "detects 'What tools are you using for logging?'",
  isToolDomainQuestion("What tools are you using for logging?"),
  true
);

assert(
  "detects 'How is your monitoring setup handling alerts?'",
  isToolDomainQuestion("How is your monitoring setup handling alerts?"),
  true
);

assert(
  "detects 'How does your tracing workflow look?'",
  isToolDomainQuestion("How does your tracing workflow look?"),
  true
);

assert(
  "rejects non-question 'Our monitoring setup is solid.'",
  isToolDomainQuestion("Our monitoring setup is solid."),
  false
);

assert(
  "rejects unrelated question 'What time is your flight?'",
  isToolDomainQuestion("What time is your flight?"),
  false
);

assert(
  "detects 'How do you handle incidents?'",
  isToolDomainQuestion("How do you handle incidents?"),
  true
);

// ── decideNextMove — tool-anchored answer rule ───────────────────────────────

console.log("\n\ud83d\udccb decideNextMove \u2014 tool-anchored answer rule");

{
  // When tools are named and trainee asks a tool-domain question,
  // move should be "answer" with toolAnchored=true
  const session = makeSession(
    [
      { type: "system", text: "*approaches booth looking interested*" },
      { type: "attendee", text: "Hey, we're using Splunk and Prometheus but incidents are still painful." },
      { type: "trainee", text: "Tell me more about your observability setup." },
      { type: "attendee", text: "Yeah, the alert noise from our monitoring stack is the biggest issue." },
    ],
    { currentTools: ["splunk", "prometheus"] }
  );

  const directive = decideNextMove(
    session,
    undefined,
    "How is that tools setup working for your debugging workflow?"
  );
  assert("move is answer when tools named + tool question", directive.move, "answer");
  assert("toolAnchored is true", directive.toolAnchored, true);
}

{
  // When no tools are named, tool-anchored rule should NOT fire
  const session = makeSession([
    { type: "system", text: "*approaches booth*" },
    { type: "attendee", text: "Hey, we have some monitoring pain." },
    { type: "trainee", text: "What kind of monitoring?" },
    { type: "attendee", text: "Mostly around alert fatigue and slow debugging." },
  ]);

  const directive = decideNextMove(
    session,
    undefined,
    "What tools are you using for monitoring?"
  );
  // Should not be toolAnchored since no tools are named
  assert("toolAnchored is undefined when no tools", directive.toolAnchored, undefined);
}

// ── decideNextMove — repair still works with named tools ─────────────────────

console.log("\n\ud83d\udccb decideNextMove \u2014 repair still works with named tools");

{
  // When the trainee is misaligned (asking about something completely unrelated),
  // even with named tools, repair (ask_clarifying) should still fire.
  const session = makeSession(
    [
      { type: "system", text: "*approaches booth*" },
      { type: "attendee", text: "We use ELK and Grafana for our monitoring stack." },
      { type: "trainee", text: "Tell me about your monitoring." },
      { type: "attendee", text: "Yeah the alert noise is killing us. We need better correlation." },
    ],
    { currentTools: ["elk", "grafana"] }
  );

  // Completely misaligned: trainee asks about something totally different
  // with no keyword overlap and no reflection markers
  const directive = decideNextMove(
    session,
    undefined,
    "Have you considered the implications of serverless architecture for your frontend rendering pipeline and how that interacts with your CDN caching strategy?"
  );
  // When misaligned, the tool-anchored rule requires aligned=true, so it should NOT fire
  assert("toolAnchored is not set when misaligned", directive.toolAnchored ?? false, false);
}

// ── decideNextMove — blocks abstract re-clarification with tools ─────────────

console.log("\n\ud83d\udccb decideNextMove \u2014 blocks abstract re-clarification");

{
  // When session has tools and trainee asks tool-domain question, ask_clarifying
  // should be redirected to "answer" (step 4b in the director)
  const session = makeSession(
    [
      { type: "system", text: "*approaches booth*" },
      { type: "attendee", text: "We're running ELK for logs and Prometheus for metrics." },
      { type: "trainee", text: "Oh interesting, how's that working?" },
      { type: "attendee", text: "It's decent but correlating signals across tools is painful." },
    ],
    { currentTools: ["elk", "prometheus"] }
  );

  // Asking a tool-domain question — should get "answer", not "ask_clarifying"
  const directive = decideNextMove(
    session,
    undefined,
    "How is that monitoring stack handling your debugging workflow?"
  );
  assert("move is answer (not ask_clarifying) with tools + tool question", directive.move, "answer");
}

// ── generateAttendeeReply — tool-anchored answers ────────────────────────────

console.log("\n\ud83d\udccb generateAttendeeReply \u2014 tool-anchored answers");

{
  // When tools are named and trainee asks a concrete question,
  // the reply should mention tool names and be a statement (no "?")
  const session = makeSession(
    [
      { type: "system", text: "*approaches booth looking interested*" },
      { type: "attendee", text: "We use Splunk for logs and Grafana for dashboards." },
      { type: "trainee", text: "Oh nice, how's that setup working?" },
      { type: "attendee", text: "It's okay for day-to-day but incidents are rough." },
    ],
    { currentTools: ["splunk", "grafana"] }
  );

  const result = generateAttendeeReply({
    traineeText: "How is that monitoring stack helping with your debugging?",
    session,
    traineeTurnCount: 3,
  });

  assertNotNull("produces a reply", result);
  if (result) {
    // Should mention at least one tool name
    const lowerText = result.text.toLowerCase();
    const mentionsTool =
      lowerText.includes("splunk") || lowerText.includes("grafana");
    assert("reply mentions a named tool", mentionsTool, true);

    // Should be a first-person statement, not a question
    assert("reply is a statement (no '?')", result.text.includes("?"), false);
  }
}

{
  // With a single tool, should still get a concrete answer
  const session = makeSession(
    [
      { type: "system", text: "*approaches booth*" },
      { type: "attendee", text: "We've been using Datadog for everything." },
      { type: "trainee", text: "How's that going?" },
      { type: "attendee", text: "It works but it's gotten expensive and slow for tracing." },
    ],
    { currentTools: ["datadog"] }
  );

  const result = generateAttendeeReply({
    traineeText: "What's the biggest gap with your current tools?",
    session,
    traineeTurnCount: 4,
  });

  assertNotNull("produces a reply with single tool", result);
  if (result) {
    const lowerText = result.text.toLowerCase();
    assert("reply mentions datadog", lowerText.includes("datadog"), true);
    assert("reply is a statement (no '?')", result.text.includes("?"), false);
  }
}

// ── Tool memory update — session.currentTools populated from transcript ──────

console.log("\n\ud83d\udccb Tool memory update \u2014 session.currentTools from transcript");

{
  // Calling generateAttendeeReply should scan attendee messages and persist tools
  const session = makeSession([
    { type: "system", text: "*approaches booth*" },
    { type: "attendee", text: "We're running Prometheus and Grafana for our monitoring." },
    { type: "trainee", text: "Nice, tell me more about your setup." },
    { type: "attendee", text: "Yeah we also have Jaeger for traces but it's not great." },
  ]);

  // Before calling generateAttendeeReply, currentTools should be undefined
  assert("currentTools starts undefined", session.currentTools, undefined);

  // Generate a reply — this should trigger tool memory update
  generateAttendeeReply({
    traineeText: "How's that working for you during incidents?",
    session,
    traineeTurnCount: 3,
  });

  // After the call, currentTools should be populated
  assertNotNull("currentTools populated after reply", session.currentTools);
  if (session.currentTools) {
    assert("includes prometheus", session.currentTools.includes("prometheus"), true);
    assert("includes grafana", session.currentTools.includes("grafana"), true);
    assert("includes jaeger", session.currentTools.includes("jaeger"), true);
  }
}

{
  // Tool memory should merge with existing tools (no duplicates)
  const session = makeSession(
    [
      { type: "system", text: "*approaches booth*" },
      { type: "attendee", text: "We use ELK for logs." },
      { type: "trainee", text: "What else?" },
      { type: "attendee", text: "Also ELK and Splunk for different teams." },
    ],
    { currentTools: ["elk"] }
  );

  generateAttendeeReply({
    traineeText: "How does that setup work for debugging?",
    session,
    traineeTurnCount: 3,
  });

  if (session.currentTools) {
    // Should have elk (existing) + splunk (new), no duplicate elk
    const elkCount = session.currentTools.filter((t) => t === "elk").length;
    assert("elk appears only once (no duplicates)", elkCount, 1);
    assert("splunk was added", session.currentTools.includes("splunk"), true);
  }
}

// ── Report ──────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
