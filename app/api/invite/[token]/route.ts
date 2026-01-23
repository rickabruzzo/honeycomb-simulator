import { NextResponse } from "next/server";
import { getInvite } from "@/lib/invites";

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
