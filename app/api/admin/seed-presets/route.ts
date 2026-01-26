import { NextRequest, NextResponse } from "next/server";
import { seedScenarioPresets } from "@/lib/seedScenarioPresets";
import { ensureConferencesSeeded } from "@/lib/conferenceStore";

/**
 * Admin endpoint to seed scenario preset data (conferences and personas for Scenarios A-F)
 * Idempotent: Only creates data that doesn't already exist
 *
 * Security:
 * - Requires x-admin-reset-token header matching ADMIN_RESET_TOKEN env var
 */
export async function POST(req: NextRequest) {
  // Check for admin token
  const adminToken = req.headers.get("x-admin-reset-token");
  const expectedToken = process.env.ADMIN_RESET_TOKEN;

  if (!expectedToken) {
    return NextResponse.json(
      { error: "ADMIN_RESET_TOKEN not configured" },
      { status: 500 }
    );
  }

  if (!adminToken || adminToken !== expectedToken) {
    return NextResponse.json(
      { error: "Unauthorized: Invalid or missing admin token" },
      { status: 401 }
    );
  }

  try {
    // Seed conferences (idempotent)
    await ensureConferencesSeeded();

    // Seed scenario personas A-F (idempotent)
    await seedScenarioPresets();

    return NextResponse.json(
      {
        success: true,
        message: "Scenario presets seeded successfully (skipped existing records)",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Seed presets failed:", error);
    return NextResponse.json(
      {
        error: "Failed to seed presets",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
