import { NextRequest, NextResponse } from "next/server";
import {
  getActivePromptBundle,
  getPromptBundle,
  savePromptBundle,
  listPromptBundles,
  setActivePromptBundle,
  getActiveBundleId,
  ensureDefaultBundleSeeded,
} from "@/lib/llm/promptBundleStore";
import type { PromptBundle } from "@/lib/llm/promptBundleTypes";

/**
 * GET /api/admin/prompt-bundle
 * Retrieve prompt bundles
 *
 * Query params:
 * - id: Specific bundle ID to retrieve (optional)
 * - list: Set to 'true' to list all bundles
 * - active: Set to 'true' to get the currently active bundle
 *
 * Security:
 * - Requires x-admin-reset-token header matching ADMIN_RESET_TOKEN env var
 *
 * Returns:
 * Single bundle: { bundle: PromptBundle, activeBundleId: string }
 * List: { bundles: PromptBundle[], activeBundleId: string }
 */
export async function GET(request: NextRequest) {
  try {
    // Validate admin token
    const token = request.headers.get("x-admin-reset-token");
    const expectedToken = process.env.ADMIN_RESET_TOKEN;

    if (!expectedToken) {
      return NextResponse.json(
        { error: "Admin not configured (ADMIN_RESET_TOKEN missing)" },
        { status: 500 }
      );
    }

    if (!token || token !== expectedToken) {
      return NextResponse.json(
        { error: "Unauthorized - invalid or missing x-admin-reset-token" },
        { status: 401 }
      );
    }

    // Ensure default bundle exists
    await ensureDefaultBundleSeeded();

    const { searchParams } = new URL(request.url);
    const bundleId = searchParams.get("id");
    const listAll = searchParams.get("list") === "true";
    const getActive = searchParams.get("active") === "true";

    const activeBundleId = await getActiveBundleId();

    if (listAll) {
      // List all bundles
      const bundles = await listPromptBundles();
      return NextResponse.json({
        bundles,
        activeBundleId,
      });
    }

    if (getActive || !bundleId) {
      // Get active bundle (default behavior)
      const bundle = await getActivePromptBundle();
      return NextResponse.json({
        bundle,
        activeBundleId,
      });
    }

    // Get specific bundle by ID
    const bundle = await getPromptBundle(bundleId);
    return NextResponse.json({
      bundle,
      activeBundleId,
    });
  } catch (error) {
    console.error("[Admin] Failed to retrieve prompt bundle:", error);
    return NextResponse.json(
      {
        error: "Failed to retrieve prompt bundle",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/prompt-bundle
 * Create or update a prompt bundle
 *
 * Request body:
 * {
 *   bundle: PromptBundle,
 *   setActive?: boolean  // Set this bundle as active after saving
 * }
 *
 * Security:
 * - Requires x-admin-reset-token header matching ADMIN_RESET_TOKEN env var
 *
 * Returns:
 * {
 *   success: true,
 *   bundle: PromptBundle,
 *   activeBundleId: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Validate admin token
    const token = request.headers.get("x-admin-reset-token");
    const expectedToken = process.env.ADMIN_RESET_TOKEN;

    if (!expectedToken) {
      return NextResponse.json(
        { error: "Admin not configured (ADMIN_RESET_TOKEN missing)" },
        { status: 500 }
      );
    }

    if (!token || token !== expectedToken) {
      return NextResponse.json(
        { error: "Unauthorized - invalid or missing x-admin-reset-token" },
        { status: 401 }
      );
    }

    const body = await request.json();

    if (!body.bundle) {
      return NextResponse.json(
        { error: "Missing required field: bundle" },
        { status: 400 }
      );
    }

    const bundle: PromptBundle = body.bundle;
    const setActive: boolean = body.setActive || false;

    // Validate bundle structure
    if (!bundle.id || !bundle.version || !bundle.facilitatorSetup || !bundle.masterSystemPrompt) {
      return NextResponse.json(
        {
          error: "Invalid bundle structure - missing required fields (id, version, facilitatorSetup, masterSystemPrompt)",
        },
        { status: 400 }
      );
    }

    console.log(`[Admin] Saving prompt bundle '${bundle.id}' (version: ${bundle.version})`);

    // Save the bundle
    const savedBundle = await savePromptBundle(bundle);

    // Set as active if requested
    if (setActive) {
      await setActivePromptBundle(bundle.id);
      console.log(`[Admin] Set bundle '${bundle.id}' as active`);
    }

    const activeBundleId = await getActiveBundleId();

    return NextResponse.json({
      success: true,
      bundle: savedBundle,
      activeBundleId,
    });
  } catch (error) {
    console.error("[Admin] Failed to save prompt bundle:", error);
    return NextResponse.json(
      {
        error: "Failed to save prompt bundle",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/prompt-bundle
 * Set the active prompt bundle
 *
 * Request body:
 * {
 *   bundleId: string
 * }
 *
 * Security:
 * - Requires x-admin-reset-token header matching ADMIN_RESET_TOKEN env var
 *
 * Returns:
 * {
 *   success: true,
 *   activeBundleId: string
 * }
 */
export async function PATCH(request: NextRequest) {
  try {
    // Validate admin token
    const token = request.headers.get("x-admin-reset-token");
    const expectedToken = process.env.ADMIN_RESET_TOKEN;

    if (!expectedToken) {
      return NextResponse.json(
        { error: "Admin not configured (ADMIN_RESET_TOKEN missing)" },
        { status: 500 }
      );
    }

    if (!token || token !== expectedToken) {
      return NextResponse.json(
        { error: "Unauthorized - invalid or missing x-admin-reset-token" },
        { status: 401 }
      );
    }

    const body = await request.json();

    if (!body.bundleId) {
      return NextResponse.json(
        { error: "Missing required field: bundleId" },
        { status: 400 }
      );
    }

    console.log(`[Admin] Setting active bundle to '${body.bundleId}'`);

    await setActivePromptBundle(body.bundleId);

    const activeBundleId = await getActiveBundleId();

    return NextResponse.json({
      success: true,
      activeBundleId,
    });
  } catch (error) {
    console.error("[Admin] Failed to set active bundle:", error);
    return NextResponse.json(
      {
        error: "Failed to set active bundle",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
