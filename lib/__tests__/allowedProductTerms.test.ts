/**
 * Regression tests: Honeycomb product terms must never produce guardrail violations.
 *
 * Run with: npx tsx lib/__tests__/allowedProductTerms.test.ts
 */

import { ALLOWED_PRODUCT_TERMS, isAllowedProductTerm } from "../guardrails/allowedProductTerms";
import { analyzeTraineeMessage } from "../simulator";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertNoViolations(text: string, state = "EXPLORATION") {
  const result = analyzeTraineeMessage(text, state);
  const violations = result.issues;
  assert(
    violations.length === 0,
    `Expected no violations for "${text}", but got: ${violations.join(", ")}`
  );
}

// ── isAllowedProductTerm ──────────────────────────────────────────────────────

function testAllowedTermLookup() {
  assert(isAllowedProductTerm("bubbleup"), "bubbleup should be allowed");
  assert(isAllowedProductTerm("BubbleUp"), "BubbleUp (mixed case) should be allowed");
  assert(isAllowedProductTerm("BUBBLEUP"), "BUBBLEUP (upper case) should be allowed");
  assert(isAllowedProductTerm("refinery"), "refinery should be allowed");
  assert(isAllowedProductTerm("Refinery"), "Refinery should be allowed");
  assert(isAllowedProductTerm("slo"), "slo should be allowed");
  assert(isAllowedProductTerm("SLO"), "SLO should be allowed");
  assert(isAllowedProductTerm("triggers"), "triggers should be allowed");
  assert(isAllowedProductTerm("wide events"), "wide events should be allowed");
  assert(isAllowedProductTerm("query builder"), "query builder should be allowed");
  assert(isAllowedProductTerm("service map"), "service map should be allowed");
  assert(isAllowedProductTerm("boards"), "boards should be allowed");
  assert(isAllowedProductTerm("markers"), "markers should be allowed");
  assert(!isAllowedProductTerm("competitor"), "competitor should NOT be allowed");
  assert(!isAllowedProductTerm(""), "empty string should NOT be allowed");
  console.log("✓ isAllowedProductTerm - lookup");
}

function testAllAllowedTermsAreLowercased() {
  for (const term of ALLOWED_PRODUCT_TERMS) {
    assert(
      term === term.toLowerCase(),
      `Term "${term}" in ALLOWED_PRODUCT_TERMS must be lowercased`
    );
  }
  console.log("✓ ALLOWED_PRODUCT_TERMS - all entries are lowercase");
}

// ── analyzeTraineeMessage – no violations for allowed terms ───────────────────

function testBubbleUpNoViolation() {
  assertNoViolations("BubbleUp is great for finding outliers in our traces");
  assertNoViolations("Have you tried BubbleUp to narrow down the spike?");
  assertNoViolations("Can BubbleUp help us here?");
  console.log("✓ BubbleUp produces no guardrail violation");
}

function testRefineryNoViolation() {
  assertNoViolations("Are you using Refinery for tail-based sampling?");
  assertNoViolations("Refinery can help with high-volume trace sampling");
  console.log("✓ Refinery produces no guardrail violation");
}

function testQueryBuilderNoViolation() {
  assertNoViolations("The query builder makes it easy to group by any field");
  assertNoViolations("You can use the query builder to explore your data");
  console.log("✓ query builder produces no guardrail violation");
}

function testServiceMapNoViolation() {
  assertNoViolations("The service map shows dependencies between your services");
  assertNoViolations("Try the service map to visualize latency across the call graph");
  console.log("✓ service map produces no guardrail violation");
}

function testSloNoViolation() {
  assertNoViolations("We can set up an SLO for this endpoint");
  assertNoViolations("Your SLOs will surface burn alerts when error rate spikes");
  assertNoViolations("Burn alerts fire when SLO budget is consumed too fast");
  console.log("✓ SLO / burn alerts produce no guardrail violation");
}

function testWideEventsNoViolation() {
  assertNoViolations("Honeycomb is built around wide events for rich context");
  assertNoViolations("Wide events let you store hundreds of fields per trace");
  console.log("✓ wide events produces no guardrail violation");
}

function testTriggersNoViolation() {
  assertNoViolations("You can set up triggers to alert on threshold breaches");
  assertNoViolations("Triggers fire when your query crosses a defined threshold");
  console.log("✓ triggers produces no guardrail violation");
}

// ── Competitor bashing still flagged ─────────────────────────────────────────

function testCompetitorBashingStillFlagged() {
  const result = analyzeTraineeMessage("We're better than Datadog in every way", "ICEBREAKER");
  assert(
    result.issues.length > 0,
    "Competitor bashing should still produce a violation"
  );
  console.log("✓ competitor bashing still flagged");
}

// ── Run ───────────────────────────────────────────────────────────────────────

console.log("Running allowedProductTerms tests...\n");

try {
  testAllowedTermLookup();
  testAllAllowedTermsAreLowercased();
  testBubbleUpNoViolation();
  testRefineryNoViolation();
  testQueryBuilderNoViolation();
  testServiceMapNoViolation();
  testSloNoViolation();
  testWideEventsNoViolation();
  testTriggersNoViolation();
  testCompetitorBashingStillFlagged();
  console.log("\n✅ All tests passed!");
} catch (error) {
  console.error("\n❌ Test failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
