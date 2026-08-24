import { NextResponse } from "next/server";
import { removeFromLeaderboardIndex } from "@/lib/leaderboardStore";
import { deleteScore } from "@/lib/scoreStore";

/**
 * Admin: remove a single leaderboard entry (and its score record) by token.
 * Unauthenticated, matching the app's other admin actions (e.g. DELETE /api/trainees/[id]).
 */
export async function DELETE(req: Request, ctx: any) {
  const { token } = await Promise.resolve(ctx.params);
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }
  const removed = await removeFromLeaderboardIndex(token);
  await deleteScore(token);
  return NextResponse.json({ ok: true, removed });
}
