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
  "telemetry pipeline",

  // AI / Honeycomb Intelligence (current product names per honeycomb.io, Oct 2026)
  "canvas",
  "honeycomb intelligence",
  "mcp",
  "mcp server",
  "agent timeline",
  "anomaly detection",

  // Other current offerings
  "private cloud",
  "frontend observability",
  "honeycomb metrics",

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
