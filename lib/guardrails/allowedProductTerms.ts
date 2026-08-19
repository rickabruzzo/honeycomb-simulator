/**
 * Honeycomb product and feature terms that are always allowed in trainee messages.
 * These are allowed even if they appear in banned keywords.
 *
 * Terms are stored lowercased for case-insensitive matching.
 */

export const ALLOWED_PRODUCT_TERMS: Set<string> = new Set([
  // Core UI / query features
  "bubbleup",
  "query builder",
  "service map",
  "derived columns",
  "calculated fields",
  "markers",

  // Boards
  "boards",
  "board templates",

  // Alerting / SLOs
  "slo",
  "slos",
  "burn alert",
  "burn alerts",
  "triggers",

  // Pipeline / sampling
  "refinery",

  // Wide events model
  "wide events",

  // Core nouns common in UI and docs
  "dataset",
  "datasets",
  "environment",
  "environments",
  "service",
  "services",
  "api keys",
]);

/**
 * Returns true if the given term is a known Honeycomb product/feature term
 * that should never generate a banned-keyword violation.
 */
export function isAllowedProductTerm(term: string): boolean {
  return ALLOWED_PRODUCT_TERMS.has(term.trim().toLowerCase());
}
