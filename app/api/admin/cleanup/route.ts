import { NextRequest, NextResponse } from "next/server";
import { runCleanup } from "@/lib/cleanupDuplicates";

/**
 * Admin endpoint to clean up duplicate personas and old conferences
 * Archives:
 * - Duplicate personas (old scenario-labeled versions)
 * - Standalone "KubeCon" conference
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
    const result = await runCleanup();

    return NextResponse.json(
      {
        success: true,
        message: "Cleanup completed successfully",
        archived: {
          personas: result.personas,
          conferences: result.conferences,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Cleanup failed:", error);
    return NextResponse.json(
      {
        error: "Failed to run cleanup",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
