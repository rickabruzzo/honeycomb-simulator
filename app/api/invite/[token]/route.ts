import { NextResponse } from "next/server";
import { getInvite, deleteInvite } from "@/lib/invites";
import { removeInviteFromIndex } from "@/lib/inviteIndex";
import { deleteSession } from "@/lib/storage";
import { deleteScore } from "@/lib/scoreStore";
import { removeFromLeaderboardIndex } from "@/lib/leaderboardStore";

export async function GET(req: Request, ctx: any) {
  // Works across Next 15 / 16 / Turbopack
  const { token } = await Promise.resolve(ctx.params);

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const invite = await getInvite(token);

  if (!invite || invite.revoked) {
    return NextResponse.json(
      { error: "Invite not found or revoked" },
      { status: 404 }
    );
  }

  // Check expiration if set
  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
    return NextResponse.json({ error: "Invite expired" }, { status: 410 });
  }

  return NextResponse.json({
    token: invite.token,
    sessionId: invite.sessionId,
    createdAt: invite.createdAt,
  });
}

/**
 * Admin: delete an invite/session entirely from the Scenario Tracker — the invite record,
 * its reverse session mapping, the session transcript, any score/leaderboard entry, and the
 * tracker index row. Unauthenticated, matching the app's other admin actions
 * (e.g. DELETE /api/trainees/[id], DELETE /api/leaderboard/entry/[token]).
 */
export async function DELETE(req: Request, ctx: any) {
  const { token } = await Promise.resolve(ctx.params);
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const removedFromIndex = await removeInviteFromIndex(token);
  const invite = await deleteInvite(token);
  if (invite?.sessionId) {
    await deleteSession(invite.sessionId);
  }
  // If the session was ever scored, drop the score + leaderboard entry keyed by the same token.
  await deleteScore(token);
  await removeFromLeaderboardIndex(token);

  const existed = removedFromIndex || Boolean(invite);
  if (!existed) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
