import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createSessionWithEnrichment } from "@/lib/createSession";
import { saveSession } from "@/lib/storage";
import { saveInvite } from "@/lib/invites";
import { addInviteToIndex } from "@/lib/inviteIndex";
import { getTrainee } from "@/lib/traineeStore";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate traineeId is present
    if (!body.traineeId || typeof body.traineeId !== "string") {
      return NextResponse.json(
        { error: "traineeId is required" },
        { status: 400 }
      );
    }

    // Verify trainee exists
    const trainee = await getTrainee(body.traineeId);
    if (!trainee) {
      return NextResponse.json(
        { error: "Trainee not found" },
        { status: 400 }
      );
    }

    // Create session using shared helper with enrichment (Phase H1: includes snapshot)
    const result = await createSessionWithEnrichment({
      personaId: body.personaId,
      conferenceId: body.conferenceId,
      conferenceContext: body.conferenceContext,
      attendeeProfile: body.attendeeProfile,
      difficulty: body.difficulty,
      traineeId: body.traineeId,
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const session = result.session;
    await saveSession(session);

    // Create invite token with full snapshot data (Phase H1)
    const token = randomUUID();
    const createdAt = new Date().toISOString();

    // Extract snapshot data from session kickoff
    const invite = {
      token,
      sessionId: session.id,
      createdAt,
      conferenceId: body.conferenceId,
      personaId: body.personaId,
      traineeId: body.traineeId,
      traineeName: body.traineeName || `${trainee.firstName} ${trainee.lastName}`,
      createdBy: body.createdBy,
      // Snapshot fields from session
      conferenceName: session.kickoff.conferenceName,
      personaDisplayName: session.kickoff.personaDisplayName,
      traineeNameShort: session.kickoff.traineeNameShort,
    };

    await saveInvite(invite);
    await addInviteToIndex(token, createdAt);

    // Extract enrichment metadata if available
    const enrichmentMeta = session.kickoff.enrichment
      ? {
          provider: session.kickoff.enrichment.provider || "mock",
          cached: false, // Always fresh when creating new session
        }
      : null;

    return NextResponse.json({
      token,
      sessionId: session.id,
      url: `/s/${token}`,
      enrichment: enrichmentMeta,
    });
  } catch (error) {
    console.error("Create invite error:", error);
    return NextResponse.json(
      { error: "Failed to create invite" },
      { status: 500 }
    );
  }
}
