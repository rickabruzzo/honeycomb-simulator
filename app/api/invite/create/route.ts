import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createSession } from "@/lib/createSession";
import { saveSession } from "@/lib/storage";
import { saveInvite } from "@/lib/invites";
import { addInviteToIndex } from "@/lib/inviteIndex";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Create session using shared helper
    const result = createSession({
      personaId: body.personaId,
      conferenceContext: body.conferenceContext,
      attendeeProfile: body.attendeeProfile,
      difficulty: body.difficulty,
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const session = result.session;
    await saveSession(session);

    // Create invite token
    const token = randomUUID();
    const createdAt = new Date().toISOString();
    const invite = {
      token,
      sessionId: session.id,
      createdAt,
      conferenceId: body.conferenceId,
      personaId: body.personaId,
      createdBy: body.createdBy,
    };

    await saveInvite(invite);
    await addInviteToIndex(token, createdAt);

    return NextResponse.json({
      token,
      sessionId: session.id,
      url: `/s/${token}`,
    });
  } catch (error) {
    console.error("Create invite error:", error);
    return NextResponse.json(
      { error: "Failed to create invite" },
      { status: 500 }
    );
  }
}
