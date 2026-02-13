/**
 * Automated Persona Validation Tests
 *
 * Tests all 6 canonical personas to ensure:
 * 1. Primary pain surfaces within first 3 turns
 * 2. No banned phrases are generated
 * 3. No incorrect tool stack phrasings (e.g., "Grafana for log aggregation")
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
 * Create a minimal mock session for testing
 */
function createMockSession(persona: Persona): SessionState {
  return {
    id: "test-session",
    currentState: "ICEBREAKER",
    stateHistory: [],
    transcript: [],
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
    startTime: new Date().toISOString(),
    active: true,
    outcomeSeed: "test-seed",
    persona: persona, // Full persona object
  } as SessionState;
}

/**
 * Generate multiple replies for a persona with varied prompts
 */
function generateMultipleReplies(
  persona: Persona,
  count: number,
  prompts: string[]
): Array<{ text: string; source: string; turn: number }> {
  const results: Array<{ text: string; source: string; turn: number }> = [];

  for (let i = 0; i < count; i++) {
    const session = createMockSession(persona);
    const promptIndex = i % prompts.length;
    const traineeText = prompts[promptIndex];
    const traineeTurnCount = (i % 5) + 1; // Cycle through turns 1-5

    const result = generateAttendeeReply({
      traineeText,
      session,
      traineeTurnCount,
    });

    if (result) {
      results.push({
        text: result.text,
        source: result.source,
        turn: traineeTurnCount,
      });
    }
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

const TEST_ITERATIONS = 50; // Number of test runs per persona

/**
 * Test Results Interface
 */
interface TestResult {
  passed: boolean;
  message: string;
}

/**
 * Test: Primary pain surfaces within first 3 turns
 */
function testEarlyPainSurfacing(persona: Persona): TestResult {
  const responses = generateMultipleReplies(
    persona,
    TEST_ITERATIONS,
    VARIED_PROMPTS
  );

  // Filter for early turn responses (turns 1-3)
  const earlyResponses = responses.filter((r) => r.turn <= 3);

  if (earlyResponses.length === 0) {
    return {
      passed: false,
      message: "No early-turn responses generated",
    };
  }

  // Check if any early response contains a primary pain test phrase
  const primaryPains = persona.painAnchors?.filter(
    (p) => p.priority === "primary"
  );

  if (!primaryPains || primaryPains.length === 0) {
    return {
      passed: false,
      message: "No primary pains defined for persona",
    };
  }

  let painSurfacedCount = 0;

  for (const response of earlyResponses) {
    const lowerText = response.text.toLowerCase();
    const containsPain = primaryPains.some((pain) =>
      pain.testPhrases.some((phrase) =>
        lowerText.includes(phrase.toLowerCase())
      )
    );

    if (containsPain) {
      painSurfacedCount++;
    }
  }

  // Expect at least 30% of early turns to surface a primary pain
  const painSurfaceRate = painSurfacedCount / earlyResponses.length;
  const passed = painSurfaceRate >= 0.3;

  return {
    passed,
    message: passed
      ? `✓ Primary pain surfaced in ${Math.round(painSurfaceRate * 100)}% of early turns (${painSurfacedCount}/${earlyResponses.length})`
      : `✗ Primary pain only surfaced in ${Math.round(painSurfaceRate * 100)}% of early turns (${painSurfacedCount}/${earlyResponses.length}), expected >= 30%`,
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
    earlyPainSurfacing: testEarlyPainSurfacing(persona),
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
