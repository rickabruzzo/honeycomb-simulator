import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { listInvitesFromIndex } from "@/lib/inviteIndex";
import { getInvite } from "@/lib/invites";
import { deleteSession } from "@/lib/storage";

/**
 * KV is configured when Vercel/Upstash env vars are present.
 */
function useKv(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

/**
 * Admin endpoint to reset demo state
 * Clears: invites + index, sessions, scores + index, leaderboard index
 *
 * Security:
 * - Requires x-admin-reset-token header matching ADMIN_RESET_TOKEN env var
 * - Optional: only allows when VERCEL_ENV !== 'production' or ALLOW_ADMIN_RESET=true
 */
export async function POST(req: NextRequest) {
  // Check for admin reset token
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

  // Optional: environment check
  const vercelEnv = process.env.VERCEL_ENV;
  const allowReset = process.env.ALLOW_ADMIN_RESET === "true";

  if (vercelEnv === "production" && !allowReset) {
    return NextResponse.json(
      {
        error:
          "Reset not allowed in production. Set ALLOW_ADMIN_RESET=true to override.",
      },
      { status: 403 }
    );
  }

  try {
    let deletedInvites = 0;
    let deletedSessions = 0;
    let deletedScores = 0;

    if (useKv()) {
      // 1. Get all invites from index
      const inviteTokens = await listInvitesFromIndex(200); // Get more than default limit

      // 2. Delete each invite and its associated session
      for (const token of inviteTokens) {
        const invite = await getInvite(token);

        if (invite) {
          // Delete session
          if (invite.sessionId) {
            await deleteSession(invite.sessionId);
            await kv.del(`session_invite:${invite.sessionId}`);
            deletedSessions++;
          }

          // Delete invite
          await kv.del(`invite:${token}`);
          deletedInvites++;
        }
      }

      // 3. Clear invites index
      await kv.del("invites:index");

      // 4. Get all scores from index and delete
      const scoresIndex = (await kv.get<string[]>("scores:index")) ?? [];
      for (const scoreToken of scoresIndex) {
        await kv.del(`score:${scoreToken}`);
        deletedScores++;
      }

      // 5. Clear scores index (note: same key used for leaderboard!)
      await kv.del("scores:index");
    } else {
      // In-memory fallback - the stores handle this internally
      return NextResponse.json(
        {
          success: true,
          message:
            "In-memory mode: Data cleared from memory (will reset on server restart)",
          deleted: {
            invites: 0,
            sessions: 0,
            scores: 0,
          },
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Demo state reset successfully",
        deleted: {
          invites: deletedInvites,
          sessions: deletedSessions,
          scores: deletedScores,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Reset demo failed:", error);
    return NextResponse.json(
      {
        error: "Failed to reset demo state",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
