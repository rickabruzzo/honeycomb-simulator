import { NextResponse } from "next/server";
import { clearLeaderboard } from "@/lib/leaderboardStore";
import { clearAllScores } from "@/lib/scoreStore";

/**
 * Admin: reset the entire leaderboard — clears every leaderboard entry and every score record
 * (so Insights resets too). Leaves trainees, personas, invites, and sessions untouched.
 * Unauthenticated, matching the app's other admin actions.
 */
export async function POST() {
  const entries = await clearLeaderboard();
  const scores = await clearAllScores();
  return NextResponse.json({ ok: true, clearedEntries: entries, clearedScores: scores });
}
