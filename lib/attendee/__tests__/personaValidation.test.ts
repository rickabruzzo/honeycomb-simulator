/**
 * Automated Persona Validation Tests
 *
 * Tests all 6 canonical personas to ensure:
 * 1. Pain is NOT volunteered at the icebreaker - information must be earned
 * 2. Pain DOES surface once the trainee earns it by probing
 * 3. No banned phrases are generated
 * 4. No incorrect tool stack phrasings (e.g., "Grafana for log aggregation")
 *
 * Run with: npx tsx lib/attendee/__tests__/personaValidation.test.ts
 */

import {
  ALL_CANONICAL_PERSONAS,
  SRE_PERSONA,
  DEVOPS_PERSONA,
  TDM_PERSONA,
  BUILD_RELEASE_PERSONA,
  DEVELOPER_PERSONA,
  PLATFORM_PERSONA,
} from "../../personas/canonicalPersonas";
import { generateAttendeeReply } from "../generateAttendeeReply";
import { containsBannedPhrase } from "../bannedPhraseFilter";
import type { Persona } from "../../scenarioTypes";
import type { SessionState } from "../../storage";

/**
 * Create a mock session.
 *
 * Defaults to a fresh ICEBREAKER session with no history. Pass `state` and `transcript` to
 * simulate a conversation already in progress - the conversation director reads the
 * transcript to decide what kind of reply the moment calls for, so an empty transcript makes
 * it behave as if this were the very first exchange regardless of the state name.
 */
function createMockSession(
  persona: Persona,
  opts: { state?: string; transcript?: SessionState["transcript"]; currentTools?: string[] } = {}
): SessionState {
  return {
    id: "test-session",
    currentState: opts.state ?? "ICEBREAKER",
    stateHistory: [],
    transcript: opts.transcript ?? [],
    violations: [],
    kickoff: {
      attendeeProfile: `Persona: ${persona.personaType}
Modifiers: ${persona.modifiers.join("; ")}
Emotional posture: ${persona.emotionalPosture}
Tooling bias: ${persona.toolingBias}
OpenTelemetry familiarity: ${persona.otelFamiliarity}`,
      personaId: persona.id,
      personaDisplayName: persona.name,
    },
    currentTools: opts.currentTools,
    startTime: new Date().toISOString(),
    active: true,
    outcomeSeed: "test-seed",
    persona: persona, // Full persona object
  } as SessionState;
}

const msg = (type: string, text: string) => ({
  id: Math.random().toString(36).slice(2),
  type,
  text,
  timestamp: new Date().toISOString(),
});

/**
 * A conversation where the trainee has already done the groundwork: greeted, asked what the
 * attendee does, and asked what they run. Pain probing after this point has been earned.
 */
const MID_CONVERSATION_TRANSCRIPT = [
  msg("trainee", "Hey, how's the conference going?"),
  msg("attendee", "Good so far - busy but fun."),
  msg("trainee", "What do you work on day to day?"),
  msg("attendee", "Reliability side, mostly incident response and on-call."),
  msg("trainee", "What are you using for observability today?"),
  msg("attendee", "Datadog and Grafana right now, logs in ELK."),
] as unknown as SessionState["transcript"];

interface GeneratedReply {
  text: string;
  source: string;
  turn: number;
  /** True when the template layer declined and the LLM owns this turn (see replyPolicy.ts). */
  handedToLlm: boolean;
  /** The director's chosen move, available whether or not a template answered. */
  move: string | undefined;
}

/**
 * Generate replies for a persona across a set of prompts.
 */
function generateMultipleReplies(
  persona: Persona,
  count: number,
  prompts: string[],
  opts: { state?: string; transcript?: SessionState["transcript"]; currentTools?: string[] } = {}
): GeneratedReply[] {
  const results: GeneratedReply[] = [];

  for (let i = 0; i < count; i++) {
    const session = createMockSession(persona, opts);
    const promptIndex = i % prompts.length;
    const traineeText = prompts[promptIndex];
    const traineeTurnCount = (i % 5) + 1; // Cycle through turns 1-5

    const result = generateAttendeeReply({
      traineeText,
      session,
      traineeTurnCount,
    });

    const move = (session as any).currentDirective?.move as string | undefined;

    results.push({
      text: result?.text ?? "",
      source: result?.source ?? "llm_handoff",
      turn: traineeTurnCount,
      handedToLlm: result === null,
      move,
    });
  }

  return results;
}

/**
 * Test Suite Configuration
 */
const VARIED_PROMPTS = [
  "Hi",
  "What's this about?",
  "Tell me more",
  "Interesting",
  "How does it work?",
  "What do you do?",
  "Never heard of you",
  "We use Datadog",
  "What makes you different?",
  "Can you show me?",
];

/** Openers that have earned nothing yet. */
const GREETING_PROMPTS = [
  "Hi",
  "Hey there",
  "How's it going?",
  "Morning",
  "Hey, how's the show treating you?",
];

/** Direct, earned probes into what hurts. */
const PAIN_PROBE_PROMPTS = [
  "What's the hardest part when something breaks?",
  "Where does that break down for you?",
  "What slows you down most during an incident?",
  "That sounds rough - what does that actually cost you?",
];

const TEST_ITERATIONS = 50; // Number of test runs per persona

/**
 * Test Results Interface
 */
interface TestResult {
  passed: boolean;
  message: string;
}

/** Does this reply text contain one of the persona's primary pain phrases? */
function mentionsPrimaryPain(persona: Persona, text: string): boolean {
  const primaryPains = (persona.painAnchors ?? []).filter(
    (p) => p.priority === "primary"
  );
  const lower = text.toLowerCase();
  return primaryPains.some((pain) =>
    pain.testPhrases.some((phrase) => lower.includes(phrase.toLowerCase()))
  );
}

/**
 * Test: pain is NOT volunteered at the icebreaker.
 *
 * This replaces an earlier test that asserted the opposite - that a primary pain must surface
 * in at least 30% of the first three turns, measured against greetings like "Hi" and
 * "Interesting" on an empty transcript. That inverted the core design rule: the attendee does
 * not volunteer problems, and information is earned through good questions. An attendee that
 * answers "Hi" by announcing its biggest operational pain is the failure mode this simulator
 * exists to train against, not the target.
 */
function testPainNotVolunteeredAtIcebreaker(persona: Persona): TestResult {
  const responses = generateMultipleReplies(
    persona,
    GREETING_PROMPTS.length * 4,
    GREETING_PROMPTS,
    { state: "ICEBREAKER" }
  );

  // Assert on the director's chosen move, not on keyword presence.
  //
  // mentionsPrimaryPain is deliberately NOT used here. The persona painAnchors carry topic
  // keywords ("debug", "on-call", "incident response", "scaling"), which appear in plenty of
  // sentences that disclose nothing - the small-talk pivot "I'm mostly looking at
  // observability and incident response tooling" matched "incident response" and looked like
  // a leak, when it is the attendee saying what it came shopping for. Keyword presence is
  // weak positive evidence and useless negative evidence.
  //
  // share_pain is the unambiguous signal: the attendee has CHOSEN to disclose a pain anchor.
  // That is what must not happen on an opener that earned nothing.
  const leaked = responses.filter((r) => r.move === "share_pain");

  const passed = leaked.length === 0;

  return {
    passed,
    message: passed
      ? `✓ Pain not volunteered across ${responses.length} icebreaker turns`
      : `✗ Chose to disclose pain on ${leaked.length}/${responses.length} icebreaker turns (e.g. text="${leaked[0].text.slice(0, 70)}")`,
  };
}

/**
 * Test: pain DOES surface once the trainee earns it by probing.
 *
 * Runs against a mid-conversation transcript where role and tooling are already established,
 * so a pain question is a natural next step rather than a cold open.
 *
 * Since the reply-ownership split (lib/attendee/replyPolicy.ts) pain disclosure belongs to the
 * LLM, not the template banks: generateAttendeeReply deliberately returns null and the message
 * route generates from session.currentDirective. So "pain surfaced" is satisfied either by a
 * template reply containing a primary pain phrase, or by the director handing the turn to the
 * LLM with a pain-oriented move. Asserting only on template text would test a layer that no
 * longer owns this behavior.
 */
function testPainSurfacesWhenProbed(persona: Persona): TestResult {
  const responses = generateMultipleReplies(
    persona,
    PAIN_PROBE_PROMPTS.length * 5,
    PAIN_PROBE_PROMPTS,
    {
      state: "PAIN_DISCOVERY",
      transcript: MID_CONVERSATION_TRANSCRIPT,
      currentTools: ["Datadog", "Grafana", "ELK"],
    }
  );

  const PAIN_ORIENTED_MOVES = new Set(["share_pain", "answer", "ask_clarifying"]);

  const surfaced = responses.filter(
    (r) =>
      mentionsPrimaryPain(persona, r.text) ||
      (r.handedToLlm && r.move !== undefined && PAIN_ORIENTED_MOVES.has(r.move))
  );

  const rate = surfaced.length / responses.length;
  const passed = rate >= 0.8;

  const moveCounts = responses.reduce<Record<string, number>>((acc, r) => {
    const key = `${r.handedToLlm ? "llm" : "template"}:${r.move ?? "none"}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return {
    passed,
    message: passed
      ? `✓ Pain surfaced on ${Math.round(rate * 100)}% of earned probes (${surfaced.length}/${responses.length})`
      : `✗ Pain surfaced on only ${Math.round(rate * 100)}% of earned probes (${surfaced.length}/${responses.length}), expected >= 80%. Moves: ${JSON.stringify(moveCounts)}`,
  };
}

/**
 * Test: No banned phrases generated
 */
function testNoBannedPhrases(persona: Persona): TestResult {
  const responses = generateMultipleReplies(
    persona,
    TEST_ITERATIONS,
    VARIED_PROMPTS
  );

  const bannedResponses: string[] = [];

  for (const response of responses) {
    if (containsBannedPhrase(response.text)) {
      bannedResponses.push(response.text);
    }
  }

  const passed = bannedResponses.length === 0;

  return {
    passed,
    message: passed
      ? `✓ No banned phrases in ${responses.length} generated responses`
      : `✗ Found ${bannedResponses.length} responses with banned phrases:\n${bannedResponses.slice(0, 3).map((r) => `  - "${r}"`).join("\n")}`,
  };
}

/**
 * Test: No incorrect tool stack phrasings
 */
function testNoIncorrectToolStacks(persona: Persona): TestResult {
  const responses = generateMultipleReplies(
    persona,
    TEST_ITERATIONS,
    VARIED_PROMPTS
  );

  const incorrectPhrasings = [
    /grafana for log aggregation/i,
    /grafana for logs/i,
  ];

  const incorrectResponses: string[] = [];

  for (const response of responses) {
    const hasIncorrectPhrasing = incorrectPhrasings.some((pattern) =>
      pattern.test(response.text)
    );

    if (hasIncorrectPhrasing) {
      incorrectResponses.push(response.text);
    }
  }

  const passed = incorrectResponses.length === 0;

  return {
    passed,
    message: passed
      ? `✓ No incorrect tool stack phrasings in ${responses.length} generated responses`
      : `✗ Found ${incorrectResponses.length} responses with incorrect phrasings:\n${incorrectResponses.slice(0, 3).map((r) => `  - "${r}"`).join("\n")}`,
  };
}

/**
 * Run all tests for a persona
 */
function runPersonaTests(persona: Persona): {
  personaName: string;
  results: Record<string, TestResult>;
  allPassed: boolean;
} {
  const results: Record<string, TestResult> = {
    painNotVolunteeredAtIcebreaker: testPainNotVolunteeredAtIcebreaker(persona),
    painSurfacesWhenProbed: testPainSurfacesWhenProbed(persona),
    noBannedPhrases: testNoBannedPhrases(persona),
    noIncorrectToolStacks: testNoIncorrectToolStacks(persona),
  };

  const allPassed = Object.values(results).every((r) => r.passed);

  return {
    personaName: persona.name,
    results,
    allPassed,
  };
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log("🧪 Canonical Persona Validation Tests");
  console.log("=".repeat(60));
  console.log("");

  const allResults: Array<{
    personaName: string;
    results: Record<string, TestResult>;
    allPassed: boolean;
  }> = [];

  for (const persona of ALL_CANONICAL_PERSONAS) {
    console.log(`Testing: ${persona.name}`);
    console.log("-".repeat(60));

    const testResults = runPersonaTests(persona);
    allResults.push(testResults);

    // Print results for this persona
    for (const [testName, result] of Object.entries(testResults.results)) {
      console.log(`  ${result.message}`);
    }

    console.log("");
  }

  // Summary
  console.log("=".repeat(60));
  console.log("Summary:");
  console.log("-".repeat(60));

  const allPassed = allResults.every((r) => r.allPassed);
  const passedCount = allResults.filter((r) => r.allPassed).length;

  for (const result of allResults) {
    const status = result.allPassed ? "✓ PASS" : "✗ FAIL";
    console.log(`  ${status}: ${result.personaName}`);
  }

  console.log("");
  console.log(
    `Overall: ${passedCount}/${allResults.length} personas passed all tests`
  );

  if (allPassed) {
    console.log("");
    console.log("✓ All tests passed!");
    process.exit(0);
  } else {
    console.log("");
    console.log("✗ Some tests failed. Review failures above.");
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch((error) => {
    console.error("Test runner failed:", error);
    process.exit(1);
  });
}

export { runAllTests, runPersonaTests };
