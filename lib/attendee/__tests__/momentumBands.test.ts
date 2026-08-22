/**
 * Tests for lib/attendee/momentumBands.ts
 *
 * Run with:  npx tsx lib/attendee/__tests__/momentumBands.test.ts
 */

import { getMomentumBand } from "../momentumBands";

let passed = 0;
let failed = 0;

function expect(label: string, actual: unknown, expected: unknown) {
  if (actual === expected) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`      expected: ${String(expected)}`);
    console.error(`      received: ${String(actual)}`);
    failed++;
  }
}

console.log("\ngetMomentumBand — GUARDED (0–15):");
expect("score 0  → GUARDED", getMomentumBand(0), "GUARDED");
expect("score 8  → GUARDED", getMomentumBand(8), "GUARDED");
expect("score 15 → GUARDED", getMomentumBand(15), "GUARDED");

console.log("\ngetMomentumBand — CURIOUS (16–30):");
expect("score 16 → CURIOUS", getMomentumBand(16), "CURIOUS");
expect("score 23 → CURIOUS", getMomentumBand(23), "CURIOUS");
expect("score 30 → CURIOUS", getMomentumBand(30), "CURIOUS");

console.log("\ngetMomentumBand — ENGAGED (31–50):");
expect("score 31 → ENGAGED", getMomentumBand(31), "ENGAGED");
expect("score 40 → ENGAGED", getMomentumBand(40), "ENGAGED");
expect("score 50 → ENGAGED", getMomentumBand(50), "ENGAGED");

console.log("\ngetMomentumBand — COMMITTED (51–100):");
expect("score 51  → COMMITTED", getMomentumBand(51), "COMMITTED");
expect("score 75  → COMMITTED", getMomentumBand(75), "COMMITTED");
expect("score 100 → COMMITTED", getMomentumBand(100), "COMMITTED");

console.log("\ngetMomentumBand — boundary clamping:");
expect("score -10  → GUARDED  (clamps to 0)",   getMomentumBand(-10),  "GUARDED");
expect("score 999  → COMMITTED (clamps to 100)", getMomentumBand(999),  "COMMITTED");
expect("score 50.6 → COMMITTED (rounds to 51)",  getMomentumBand(50.6), "COMMITTED");
expect("score 50.4 → ENGAGED   (rounds to 50)",  getMomentumBand(50.4), "ENGAGED");

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
