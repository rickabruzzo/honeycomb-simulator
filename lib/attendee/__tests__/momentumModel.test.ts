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

  momentum = updateMomentum(momentum, {
    kind: "trainee",
    text: "Thanks for the information!",
  });
  assert(momentum.score > 0, "should increase score on positive signals");

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

  momentum = updateMomentum(momentum, {
    kind: "attendee",
    text: "Not interested, no thanks",
  });
  assert(momentum.score < 0, "should decrease score on negative signals");

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

// Run all tests
console.log("Running momentum model tests...\n");

try {
  testInitializeMomentum();
  testUpdateMomentum();
  testPositiveSignals();
  testQuestions();
  testNegativeSignals();
  testConversationFlow();
  console.log("\n✅ All tests passed!");
} catch (error) {
  console.error("\n❌ Test failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
