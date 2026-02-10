#!/usr/bin/env node

/**
 * Test suite for outcome commitment detectors.
 * Run: node scripts/test-outcome-commitment.js
 */

// Import the commitment detectors
// Note: Using require since this is a .js file, not .ts
const { resolve } = require("path");
const { execSync } = require("child_process");

// Build TypeScript first
console.log("Building TypeScript...");
try {
  execSync("npm run build", { cwd: resolve(__dirname, ".."), stdio: "inherit" });
} catch (error) {
  console.error("Build failed. Cannot run tests.");
  process.exit(1);
}

// Import from built files
const {
  detectDemoCommitment,
  detectMqlCommitment,
  detectSelfServiceCommitment,
  detectDeferredCommitment,
  detectCommittedOutcome,
} = require("../lib/outcomeCommitment");

// Test cases
const tests = [
  // Demo commitments (should match)
  { text: "Can you show me a demo?", expected: "DEMO_READY", fn: detectDemoCommitment },
  { text: "I'd like to see how this works in practice.", expected: "DEMO_READY", fn: detectDemoCommitment },
  { text: "Walk me through how you'd debug something.", expected: "DEMO_READY", fn: detectDemoCommitment },
  { text: "Is there a demo available?", expected: "DEMO_READY", fn: detectDemoCommitment },

  // MQL commitments (should match)
  { text: "Can you scan my badge?", expected: "MQL_READY", fn: detectMqlCommitment },
  { text: "Have someone from sales follow up with me.", expected: "MQL_READY", fn: detectMqlCommitment },
  { text: "Let's schedule a call next week.", expected: "MQL_READY", fn: detectMqlCommitment },
  { text: "I'll give you my contact info.", expected: "MQL_READY", fn: detectMqlCommitment },

  // Self-service commitments (should match)
  { text: "I'll check out the free tier and docs.", expected: "SELF_SERVICE_READY", fn: detectSelfServiceCommitment },
  { text: "Point me to the documentation please.", expected: "SELF_SERVICE_READY", fn: detectSelfServiceCommitment },
  { text: "I want to try it myself first.", expected: "SELF_SERVICE_READY", fn: detectSelfServiceCommitment },
  { text: "Where can I sign up?", expected: "SELF_SERVICE_READY", fn: detectSelfServiceCommitment },

  // Deferred commitments (should match)
  { text: "This is on our radar for next quarter.", expected: "DEFERRED_INTEREST", fn: detectDeferredCommitment },
  { text: "We're not ready yet but interested.", expected: "DEFERRED_INTEREST", fn: detectDeferredCommitment },
  { text: "After our migration we'll revisit this.", expected: "DEFERRED_INTEREST", fn: detectDeferredCommitment },

  // Non-commitments (should NOT match)
  { text: "That sounds interesting.", expected: null, fn: detectDemoCommitment },
  { text: "Tell me more about the pricing.", expected: null, fn: detectMqlCommitment },
  { text: "What tools do you integrate with?", expected: null, fn: detectSelfServiceCommitment },
  { text: "How does this compare to Datadog?", expected: null, fn: detectDemoCommitment },
];

// Run tests
let passed = 0;
let failed = 0;

console.log("\n=== Testing Outcome Commitment Detectors ===\n");

tests.forEach((test, index) => {
  const result = test.fn ? test.fn(test.text) : detectCommittedOutcome(test.text);
  const expectedBool = test.expected !== null;
  const resultBool = result === true || (typeof result === "string" && result !== null);

  const success = expectedBool ? resultBool : !resultBool;

  if (success) {
    console.log(`✓ Test ${index + 1}: PASS`);
    console.log(`  Input: "${test.text}"`);
    console.log(`  Expected commitment: ${expectedBool ? "YES" : "NO"}`);
    console.log(`  Got: ${result || "NO"}\n`);
    passed++;
  } else {
    console.log(`✗ Test ${index + 1}: FAIL`);
    console.log(`  Input: "${test.text}"`);
    console.log(`  Expected commitment: ${expectedBool ? "YES" : "NO"}`);
    console.log(`  Got: ${result || "NO"}\n`);
    failed++;
  }
});

console.log("=== Summary ===");
console.log(`Passed: ${passed}/${tests.length}`);
console.log(`Failed: ${failed}/${tests.length}`);

if (failed > 0) {
  process.exit(1);
}
