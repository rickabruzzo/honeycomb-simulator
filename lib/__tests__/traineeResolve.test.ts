/**
 * Trainee Resolution Tests
 *
 * Ensures invite creation works for:
 * - Known trainee IDs (exact match)
 * - Unknown trainee IDs with traineeName (fuzzy match or auto-register)
 * - Unknown trainee IDs without traineeName (should fail)
 *
 * Run with:  npx tsx lib/__tests__/traineeResolve.test.ts
 */

import {
  normalizeTraineeId,
  slugifyName,
  resolveTrainee,
  upsertTrainee,
  getTrainee,
} from "../traineeStore";

let passed = 0;
let failed = 0;

function assert(label: string, actual: unknown, expected: unknown) {
  if (actual === expected) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`      expected: ${JSON.stringify(expected)}`);
    console.error(`      received: ${JSON.stringify(actual)}`);
    failed++;
  }
}

function assertNotNull(label: string, actual: unknown) {
  if (actual != null) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`      expected non-null, got: ${String(actual)}`);
    failed++;
  }
}

function assertNull(label: string, actual: unknown) {
  if (actual == null) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`      expected null, got: ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ── normalizeTraineeId ──────────────────────────────────────────────

console.log("\n📋 normalizeTraineeId");

assert(
  "strips 4-char random suffix",
  normalizeTraineeId("rick-abruzzo-5zzj"),
  "rick-abruzzo"
);

assert(
  "strips 3-char random suffix",
  normalizeTraineeId("maggie-ennis-abc"),
  "maggie-ennis"
);

assert(
  "strips 6-char random suffix",
  normalizeTraineeId("john-doe-abc123"),
  "john-doe"
);

assert(
  "returns inputId unchanged if no suffix pattern",
  normalizeTraineeId("rick-abruzzo"),
  "rick-abruzzo"
);

assert(
  "falls back to slugified name when no suffix stripped",
  normalizeTraineeId("rick-abruzzo", "Rick Abruzzo"),
  "rick-abruzzo"
);

assert(
  "returns inputId as-is when no suffix and no name",
  normalizeTraineeId("exact-id"),
  "exact-id"
);

// ── slugifyName ─────────────────────────────────────────────────────

console.log("\n📋 slugifyName");

assert("slugifies simple name", slugifyName("Rick Abruzzo"), "rick-abruzzo");

assert(
  "slugifies name with extra spaces",
  slugifyName("  Rick   Abruzzo  "),
  "rick-abruzzo"
);

assert(
  "removes special characters",
  slugifyName("O'Brien McDonald"),
  "obrien-mcdonald"
);

assert(
  "truncates long names to 30 chars",
  slugifyName("Bartholomew Christopherson-Williamson the Third").length <= 30,
  true
);

// ── resolveTrainee ──────────────────────────────────────────────────

async function testResolveTrainee() {
  console.log("\n📋 resolveTrainee");

  // Seed a known trainee with random-suffix ID
  await upsertTrainee({
    id: "rick-abruzzo-x1y2",
    firstName: "Rick",
    lastName: "Abruzzo",
  });

  // Test 1: Exact match
  const exact = await resolveTrainee("rick-abruzzo-x1y2");
  assertNotNull("exact match returns trainee", exact);
  assert("exact match has correct id", exact?.id, "rick-abruzzo-x1y2");
  assert("exact match has correct firstName", exact?.firstName, "Rick");

  // Test 2: Different suffix should match via normalized ID
  const fuzzy = await resolveTrainee("rick-abruzzo-9abc", "Rick Abruzzo");
  assertNotNull("normalized ID matches existing trainee", fuzzy);
  assert("fuzzy match has correct firstName", fuzzy?.firstName, "Rick");
  assert("fuzzy match has correct lastName", fuzzy?.lastName, "Abruzzo");

  // Test 3: Unknown traineeId with traineeName auto-registers
  const autoReg = await resolveTrainee("jane-doe-zzzz", "Jane Doe");
  assertNotNull("unknown ID with name auto-registers", autoReg);
  assert("auto-registered firstName", autoReg?.firstName, "Jane");
  assert("auto-registered lastName", autoReg?.lastName, "Doe");
  assert("auto-registered uses canonical slug ID", autoReg?.id, "jane-doe");

  // Verify persistence
  const persisted = await getTrainee("jane-doe");
  assertNotNull("auto-registered trainee is persisted", persisted);
  assert("persisted firstName", persisted?.firstName, "Jane");

  // Test 4: Unknown traineeId without traineeName returns null
  const noName = await resolveTrainee("totally-unknown-zzzz");
  assertNull("unknown ID without name returns null", noName);

  // Test 5: Name-only match works when input ID is garbage
  const nameMatch = await resolveTrainee("garbage-id", "Rick Abruzzo");
  assertNotNull("slugified name matches existing trainee", nameMatch);
  assert("name match has correct firstName", nameMatch?.firstName, "Rick");

  // Test 6: Multi-word last name handled correctly
  const multiWord = await resolveTrainee("unknown-xyz", "Mary Jane Watson");
  assertNotNull("multi-word name auto-registers", multiWord);
  assert("multi-word firstName", multiWord?.firstName, "Mary");
  assert("multi-word lastName", multiWord?.lastName, "Jane Watson");
  assert("multi-word uses canonical slug", multiWord?.id, "mary-jane-watson");
}

// ── Run async tests and report ──────────────────────────────────────

testResolveTrainee().then(() => {
  console.log(`\n${"─".repeat(50)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
});
