#!/usr/bin/env node

/**
 * Data Wipe Script
 *
 * Removes all old sessions, invites, scores, and leaderboard entries from KV storage.
 * This is a hard reset to clean up data from the conference/difficulty era.
 *
 * Usage:
 *   node scripts/wipe-old-data.js [--dry-run]
 *
 * Options:
 *   --dry-run    Show what would be deleted without actually deleting
 */

require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@vercel/kv");

const isDryRun = process.argv.includes("--dry-run");

if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
  console.error("❌ Missing KV environment variables");
  console.error("   Make sure KV_REST_API_URL and KV_REST_API_TOKEN are set in .env.local");
  process.exit(1);
}

const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

async function main() {
  console.log("🗑️  Data Wipe Script");
  console.log("=" .repeat(50));

  if (isDryRun) {
    console.log("⚠️  DRY RUN MODE - No data will be deleted\n");
  } else {
    console.log("⚠️  DESTRUCTIVE MODE - Data will be permanently deleted\n");
    console.log("Press Ctrl+C within 5 seconds to cancel...");
    await new Promise((resolve) => setTimeout(resolve, 5000));
    console.log("Proceeding with data wipe...\n");
  }

  let totalDeleted = 0;

  // 1. Wipe all sessions
  console.log("📦 Scanning sessions...");
  const sessionKeys = [];
  let sessionCursor = 0;
  do {
    const [nextCursor, keys] = await kv.scan(sessionCursor, {
      match: "session:*",
      count: 100,
    });
    sessionCursor = nextCursor;
    sessionKeys.push(...keys);
  } while (sessionCursor !== 0);

  console.log(`   Found ${sessionKeys.length} sessions`);
  if (!isDryRun && sessionKeys.length > 0) {
    for (const key of sessionKeys) {
      await kv.del(key);
    }
    console.log(`   ✅ Deleted ${sessionKeys.length} sessions`);
    totalDeleted += sessionKeys.length;
  }

  // 2. Wipe all invites
  console.log("📧 Scanning invites...");
  const inviteKeys = [];
  let inviteCursor = 0;
  do {
    const [nextCursor, keys] = await kv.scan(inviteCursor, {
      match: "invite:*",
      count: 100,
    });
    inviteCursor = nextCursor;
    inviteKeys.push(...keys);
  } while (inviteCursor !== 0);

  console.log(`   Found ${inviteKeys.length} invites`);
  if (!isDryRun && inviteKeys.length > 0) {
    for (const key of inviteKeys) {
      await kv.del(key);
    }
    console.log(`   ✅ Deleted ${inviteKeys.length} invites`);
    totalDeleted += inviteKeys.length;
  }

  // 3. Wipe invite index
  console.log("📇 Wiping invite index...");
  if (!isDryRun) {
    await kv.del("invite-index");
    console.log(`   ✅ Cleared invite index`);
    totalDeleted += 1;
  }

  // 4. Wipe all scores
  console.log("📊 Scanning scores...");
  const scoreKeys = [];
  let scoreCursor = 0;
  do {
    const [nextCursor, keys] = await kv.scan(scoreCursor, {
      match: "score:*",
      count: 100,
    });
    scoreCursor = nextCursor;
    scoreKeys.push(...keys);
  } while (scoreCursor !== 0);

  console.log(`   Found ${scoreKeys.length} scores`);
  if (!isDryRun && scoreKeys.length > 0) {
    for (const key of scoreKeys) {
      await kv.del(key);
    }
    console.log(`   ✅ Deleted ${scoreKeys.length} scores`);
    totalDeleted += scoreKeys.length;
  }

  // 5. Wipe leaderboard
  console.log("🏆 Wiping leaderboard...");
  if (!isDryRun) {
    await kv.del("leaderboard");
    console.log(`   ✅ Cleared leaderboard`);
    totalDeleted += 1;
  }

  // 6. Wipe enrichment cache
  console.log("🧠 Scanning enrichment cache...");
  const enrichmentKeys = [];
  let enrichmentCursor = 0;
  do {
    const [nextCursor, keys] = await kv.scan(enrichmentCursor, {
      match: "enrichment:*",
      count: 100,
    });
    enrichmentCursor = nextCursor;
    enrichmentKeys.push(...keys);
  } while (enrichmentCursor !== 0);

  console.log(`   Found ${enrichmentKeys.length} enrichment cache entries`);
  if (!isDryRun && enrichmentKeys.length > 0) {
    for (const key of enrichmentKeys) {
      await kv.del(key);
    }
    console.log(`   ✅ Deleted ${enrichmentKeys.length} enrichment entries`);
    totalDeleted += enrichmentKeys.length;
  }

  console.log("\n" + "=".repeat(50));
  if (isDryRun) {
    console.log(`Would delete ${
      sessionKeys.length +
      inviteKeys.length +
      scoreKeys.length +
      enrichmentKeys.length +
      2 // invite-index + leaderboard
    } items (dry run)`);
  } else {
    console.log(`✅ Successfully deleted ${totalDeleted} items`);
  }
  console.log("\n⚠️  Note: Personas, Trainees, and Conferences are NOT deleted.");
  console.log("   Use the Editor UI to archive those if needed.");
}

main()
  .then(() => {
    console.log("\n✨ Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });
