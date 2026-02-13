/**
 * Guardrail Regression Tests
 *
 * Ensures "high-cardinality" is allowed and does NOT trigger violations.
 */

import { SIMULATOR_CONFIG } from "../simulatorConfig";

describe("Guardrail - high-cardinality", () => {
  test("high-cardinality should NOT be in banned keywords list", () => {
    const bannedKeywords =
      SIMULATOR_CONFIG.keyword_restrictions?.banned_product_keywords ?? [];

    expect(bannedKeywords).not.toContain("high-cardinality");
    expect(bannedKeywords).not.toContain("high cardinality");
    expect(bannedKeywords).not.toContain("cardinality");
  });

  test("high-cardinality should be in allowed technical terms", () => {
    const allowedTerms =
      (SIMULATOR_CONFIG.keyword_restrictions as any)
        ?.allowed_technical_terms ?? [];

    expect(allowedTerms).toContain("high-cardinality");
  });
});
