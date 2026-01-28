import { NextRequest, NextResponse } from "next/server";
import {
  listTrainees,
  upsertTrainee,
  archiveTrainee,
  ensureTraineesSeeded,
  formatTraineeFull,
} from "@/lib/traineeStore";
import { invalidateBootstrapCache } from "@/lib/memoryStore";

/**
 * POST /api/admin/cleanup-trainees
 * Cleanup trainees to only keep Rick Abruzzo and Maggie Ennis
 *
 * Query params:
 * - dryRun=true: Returns what would be archived without making changes
 *
 * Safety:
 * - Requires x-admin-reset-token header matching ADMIN_RESET_TOKEN env var
 * - In production, requires ALLOW_ADMIN_RESET=true env var
 * - Soft deletes (archives) all trainees except Rick and Maggie
 * - Ensures Rick and Maggie exist (creates if missing)
 *
 * Returns:
 * {
 *   success: true,
 *   kept: [{ id, name }],
 *   toArchive: [{ id, name }],  // Only in dryRun
 *   archivedCount: number,
 *   createdCount: number,
 *   total: number,
 *   dryRun: boolean
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Validate admin token
    const token = request.headers.get("x-admin-reset-token");
    const expectedToken = process.env.ADMIN_RESET_TOKEN;

    if (!expectedToken) {
      return NextResponse.json(
        { error: "Admin reset not configured (ADMIN_RESET_TOKEN missing)" },
        { status: 500 }
      );
    }

    if (!token || token !== expectedToken) {
      return NextResponse.json(
        { error: "Unauthorized - invalid or missing x-admin-reset-token" },
        { status: 401 }
      );
    }

    // Production safety check
    const isProduction = process.env.VERCEL_ENV === "production";
    const allowReset = process.env.ALLOW_ADMIN_RESET === "true";

    if (isProduction && !allowReset) {
      return NextResponse.json(
        {
          error: "Admin reset disabled in production (ALLOW_ADMIN_RESET not true)",
          hint: "Set ALLOW_ADMIN_RESET=true env var to enable",
        },
        { status: 403 }
      );
    }

    // Check for dry run mode
    const { searchParams } = new URL(request.url);
    const dryRun = searchParams.get("dryRun") === "true";

    console.log(`[Admin] Starting trainee cleanup (production: ${isProduction}, dryRun: ${dryRun})`);

    // Ensure seeded first
    await ensureTraineesSeeded();

    // Define allowlist - match by name (case-insensitive)
    const allowlist = [
      { firstName: "Rick", lastName: "Abruzzo" },
      { firstName: "Maggie", lastName: "Ennis" },
    ];

    // Helper to check if trainee is in allowlist
    const isInAllowlist = (trainee: { firstName: string; lastName: string }) => {
      return allowlist.some(
        (allowed) =>
          allowed.firstName.toLowerCase() === trainee.firstName.toLowerCase() &&
          allowed.lastName.toLowerCase() === trainee.lastName.toLowerCase()
      );
    };

    // Load all trainees (excluding already archived ones)
    const allTrainees = await listTrainees(false);
    console.log(`[Admin] Found ${allTrainees.length} non-archived trainees`);

    const kept: Array<{ id: string; name: string }> = [];
    const toArchive: Array<{ id: string; name: string }> = [];
    let archivedCount = 0;
    let createdCount = 0;

    // Categorize trainees: keep or archive
    for (const trainee of allTrainees) {
      const fullName = `${trainee.firstName} ${trainee.lastName}`;
      if (isInAllowlist(trainee)) {
        kept.push({ id: trainee.id, name: fullName });
      } else {
        toArchive.push({ id: trainee.id, name: fullName });
      }
    }

    // If not dry run, actually archive
    if (!dryRun) {
      for (const item of toArchive) {
        const success = await archiveTrainee(item.id);
        if (success) {
          archivedCount++;
          console.log(`[Admin] Archived: ${item.name} (${item.id})`);
        }
      }

      // Create missing trainees from allowlist
      for (const allowed of allowlist) {
        const exists = kept.some(
          (k) => k.name.toLowerCase() === `${allowed.firstName} ${allowed.lastName}`.toLowerCase()
        );
        if (!exists) {
          const created = await upsertTrainee({
            firstName: allowed.firstName,
            lastName: allowed.lastName,
          });
          createdCount++;
          const fullName = `${created.firstName} ${created.lastName}`;
          kept.push({ id: created.id, name: fullName });
          console.log(`[Admin] Created: ${fullName} (${created.id})`);
        }
      }

      // Invalidate bootstrap cache so changes appear immediately
      invalidateBootstrapCache();

      console.log(
        `[Admin] Cleanup complete: kept ${kept.length}, archived ${archivedCount}, created ${createdCount}`
      );
    } else {
      console.log(
        `[Admin] Dry run: would keep ${kept.length}, would archive ${toArchive.length}`
      );
    }

    const response: any = {
      success: true,
      kept,
      archivedCount: dryRun ? toArchive.length : archivedCount,
      createdCount,
      total: allTrainees.length,
      dryRun,
    };

    if (dryRun) {
      response.toArchive = toArchive;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("[Admin] Cleanup failed:", error);
    return NextResponse.json(
      {
        error: "Cleanup failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
