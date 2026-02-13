#!/usr/bin/env tsx
/**
 * Wipe Training Data Script
 *
 * Deletes all training session data to reset analytics.
 * This ensures Tracker/Leaderboard/Insights show clean baselines after stabilization.
 *
 * WHAT THIS WIPES:
 * - All sessions (in-memory and KV)
 * - All invites (in-memory and KV)
 * - All scorecards (in-memory and KV)
 * - Analytics aggregates/caches (if any)
 * - Session-related indexes
 *
 * WHAT THIS PRESERVES:
 * - Personas (canonical personas will be reseeded on next bootstrap)
 * - Trainees
 * - Configuration
 *
 * RUN WITH:
 *   npx tsx scripts/wipeTrainingData.ts
 *
 * OR:
 *   npm run wipe-data
 */

import { kv } from "@vercel/kv";
import { useKv } from "../lib/kvConfig";
import { getMemStore } from "../lib/memoryStore";

async function wipeTrainingData() {
  console.log("🗑️  Wiping training data...");
  console.log("");

  let wiped = 0;

  if (useKv()) {
    console.log("Using Vercel KV storage");

    // Wipe sessions
    try {
      const sessionKeys = await kv.keys("session:*");
      for (const key of sessionKeys) {
        await kv.del(key);
        wiped++;
      }
      console.log(`✓ Wiped ${sessionKeys.length} sessions`);
    } catch (error) {
      console.error("Error wiping sessions:", error);
    }

    // Wipe invites
    try {
      const inviteKeys = await kv.keys("invite:*");
      for (const key of inviteKeys) {
        await kv.del(key);
        wiped++;
      }
      console.log(`✓ Wiped ${inviteKeys.length} invites`);
    } catch (error) {
      console.error("Error wiping invites:", error);
    }

    // Wipe scorecards
    try {
      const scorecardKeys = await kv.keys("scorecard:*");
      for (const key of scorecardKeys) {
        await kv.del(key);
        wiped++;
      }
      console.log(`✓ Wiped ${scorecardKeys.length} scorecards`);
    } catch (error) {
      console.error("Error wiping scorecards:", error);
    }

    // Wipe analytics aggregates (if any)
    try {
      const analyticsKeys = await kv.keys("analytics:*");
      for (const key of analyticsKeys) {
        await kv.del(key);
        wiped++;
      }
      console.log(`✓ Wiped ${analyticsKeys.length} analytics caches`);
    } catch (error) {
      console.error("Error wiping analytics:", error);
    }

    // Wipe indexes
    try {
      await kv.del("sessions:index");
      await kv.del("invites:index");
      await kv.del("scorecards:index");
      wiped += 3;
      console.log("✓ Wiped indexes");
    } catch (error) {
      console.error("Error wiping indexes:", error);
    }
  } else {
    console.log("Using in-memory storage");

    const mem = getMemStore();

    // Wipe sessions
    const sessionCount = mem.sessions.size;
    mem.sessions.clear();
    console.log(`✓ Wiped ${sessionCount} sessions`);
    wiped += sessionCount;

    // Wipe invites
    const inviteCount = mem.invites.size;
    mem.invites.clear();
    mem.inviteIndex.clear();
    console.log(`✓ Wiped ${inviteCount} invites`);
    wiped += inviteCount;
  }

  console.log("");
  console.log(`✅ Total items wiped: ${wiped}`);
  console.log("");
  console.log("Tracker/Leaderboard/Insights should now show empty baselines.");
}

// Run the script
wipeTrainingData()
  .then(() => {
    console.log("Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Failed to wipe training data:", error);
    process.exit(1);
  });
