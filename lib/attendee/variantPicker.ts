/**
 * Deterministic variant picker for response templates.
 * Uses seeded randomness to ensure consistent phrasing per session.
 */

import { hashSeed, seededRandom } from "../simulator";

/**
 * Pick a variant from an array using deterministic seeded randomness.
 *
 * @param seed - Session outcome seed
 * @param key - Unique key for this pick (e.g., "intent:ask_tool_stack:turn:2")
 * @param variants - Array of variant strings
 * @returns Selected variant
 */
export function pickVariant(
  seed: string,
  key: string,
  variants: string[]
): string {
  if (variants.length === 0) {
    return "";
  }

  if (variants.length === 1) {
    return variants[0];
  }

  // Combine seed with key for unique deterministic selection
  const combinedSeed = `${seed}:${key}`;
  const numericSeed = hashSeed(combinedSeed);
  const random = seededRandom(numericSeed);

  // Map random [0,1) to index
  const index = Math.floor(random * variants.length);
  return variants[index];
}
