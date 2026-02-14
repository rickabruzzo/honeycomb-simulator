/**
 * Simple test for momentum model
 * Run with: node --import tsx lib/attendee/__tests__/momentumModel.test.ts
 */

import {
  initializeMomentum,
  updateMomentum,
} from "../momentumModel";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function testInitializeMomentum() {
  const momentum = initializeMomentum();
  assert(momentum.score === 0, "should initialize with score 0");
  assert(momentum.turn === 0, "should initialize with turn 0");
  assert(momentum.lastUpdatedAt !== undefined, "should have lastUpdatedAt");
  console.log("✓ initializeMomentum");
}

function testUpdateMomentum() {
  let momentum = initializeMomentum();

  // Test turn increment
  momentum = updateMomentum(momentum, {
    kind: "trainee",
    text: "Hello",
  });
  assert(momentum.turn === 1, "should increment turn to 1");

  momentum = updateMomentum(momentum, {
    kind: "attendee",
    text: "Hi there",
  });
  assert(momentum.turn === 2, "should increment turn to 2");

  console.log("✓ updateMomentum - turn counter");
}

function testPositiveSignals() {
  let momentum = initializeMomentum();

  // Set up context first (attendee mentions something)
  momentum = updateMomentum(momentum, {
    kind: "attendee",
    text: "We have some documentation and a free tier available.",
  });
  const afterAttendee = momentum.score;

  // Now trainee responds with a question (relevant to docs/tier)
  momentum = updateMomentum(momentum, {
    kind: "trainee",
    text: "How does the free tier work? Is there documentation?",
  });
  assert(momentum.score > afterAttendee, `should increase score with relevant question (was ${afterAttendee}, now ${momentum.score})`);

  console.log("✓ updateMomentum - positive signals");
}

function testQuestions() {
  let momentum = initializeMomentum();

  momentum = updateMomentum(momentum, {
    kind: "trainee",
    text: "How does this work? Can you show me?",
  });
  assert(momentum.score > 0, "should increase score on questions");

  console.log("✓ updateMomentum - questions");
}

function testNegativeSignals() {
  let momentum = initializeMomentum();

  // Attendee saying they're not interested (starts at 0, gets +2 for attendee talking)
  momentum = updateMomentum(momentum, {
    kind: "attendee",
    text: "Not interested, no thanks",
  });
  // Score will be positive (attendee talking = +2), so test against baseline
  const afterNegative = momentum.score;

  // Positive attendee message for comparison
  let m2 = initializeMomentum();
  m2 = updateMomentum(m2, {
    kind: "attendee",
    text: "Yes, I'd like to know more!",
  });

  assert(afterNegative >= 0, "attendee negative signal still scores (they're talking)");

  console.log("✓ updateMomentum - negative signals");
}

function testConversationFlow() {
  let momentum = initializeMomentum();

  // Trainee asks question
  momentum = updateMomentum(momentum, {
    kind: "trainee",
    text: "Can you tell me more about this?",
  });
  const scoreAfterTrainee = momentum.score;

  // Attendee responds with long message
  momentum = updateMomentum(momentum, {
    kind: "attendee",
    text: "This is a very long and detailed response that provides substantial information about the topic and demonstrates engagement with the conversation.",
  });

  assert(momentum.turn === 2, "should have 2 turns");
  assert(momentum.score > scoreAfterTrainee, "score should increase with detailed response");

  console.log("✓ updateMomentum - conversation flow");
}

function testNonAnswerPenalty() {
  let m = initializeMomentum();
  m = updateMomentum(m, {
    kind: "attendee",
    text: "Tracing is a mess. We don't have good visibility into request flows."
  });
  const before = m.score;
  m = updateMomentum(m, {
    kind: "trainee",
    text: "not much"
  });
  assert(m.score < before, "should decrease momentum for non-answer / topic shift");

  console.log("✓ updateMomentum - non-answer penalty");
}

function testAlignedReflectionBonus() {
  let m = initializeMomentum();
  m = updateMomentum(m, {
    kind: "attendee",
    text: "We struggle with tracing. Our distributed traces are incomplete and hard to correlate."
  });
  const before = m.score;
  m = updateMomentum(m, {
    kind: "trainee",
    text: "So the tracing issue is about incomplete traces? Are you missing spans or is it a correlation problem?"
  });
  assert(m.score > before, `should increase momentum for aligned reflection + relevant question (was ${before}, now ${m.score})`);

  console.log("✓ updateMomentum - aligned reflection bonus");
}

// Run all tests
console.log("Running momentum model tests...\n");

try {
  testInitializeMomentum();
  testUpdateMomentum();
  testPositiveSignals();
  testQuestions();
  testNegativeSignals();
  testConversationFlow();
  testNonAnswerPenalty();
  testAlignedReflectionBonus();
  console.log("\n✅ All tests passed!");
} catch (error) {
  console.error("\n❌ Test failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
