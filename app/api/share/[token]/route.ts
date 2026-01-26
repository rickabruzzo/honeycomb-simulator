import { NextResponse } from "next/server";
import { getScore } from "@/lib/scoreStore";
import { getInviteForSession } from "@/lib/invites";

export async function GET(req: Request, ctx: any) {
  // Works across Next 15 / 16 / Turbopack
  const { token } = await Promise.resolve(ctx.params);

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const score = await getScore(token);

  if (!score) {
    return NextResponse.json(
      { error: "Score not found" },
      { status: 404 }
    );
  }

  // Try to get invite token for review link
  let inviteToken: string | null = null;
  try {
    inviteToken = await getInviteForSession(score.sessionId);
  } catch (e) {
    // Non-critical, continue without invite token
  }

  // Return score WITHOUT attendeeProfile (it's not in ScoreRecord anyway)
  return NextResponse.json({
    ...score,
    inviteToken, // Add invite token for review link
  });
}
