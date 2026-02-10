import { NextResponse } from "next/server";
import { getInvite } from "@/lib/invites";
import { getSession } from "@/lib/storage";
import { normalizeTranscript } from "@/lib/normalizeTranscript";

/**
 * Trainer-safe review endpoint that returns session data for a given invite token.
 * Redacts attendeeProfile to prevent exposure in UI.
 */
export async function GET(req: Request, ctx: any) {
  // Works across Next 15 / 16 / Turbopack
  const { token } = await Promise.resolve(ctx.params);

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  // Resolve invite
  const invite = await getInvite(token);
  if (!invite) {
    return NextResponse.json(
      { error: "Invalid or revoked invite token" },
      { status: 404 }
    );
  }

  if (invite.revoked) {
    return NextResponse.json(
      { error: "This invite has been revoked" },
      { status: 403 }
    );
  }

  // Fetch session
  const session = await getSession(invite.sessionId);
  if (!session) {
    return NextResponse.json(
      { error: "Session not found" },
      { status: 404 }
    );
  }

  // Redact attendeeProfile from kickoff
  const redactedKickoff = {
    personaId: session.kickoff.personaId,
    enrichment: session.kickoff.enrichment,
    // Snapshot fields
    personaDisplayName: session.kickoff.personaDisplayName,
    traineeId: session.kickoff.traineeId,
    traineeNameShort: session.kickoff.traineeNameShort,
    // attendeeProfile is intentionally omitted
  };

  // Normalize transcript
  const transcript = normalizeTranscript(session.transcript);

  return NextResponse.json({
    token,
    sessionId: session.id,
    kickoff: redactedKickoff,
    transcript,
    currentState: session.currentState,
    violations: session.violations ?? [],
    active: session.active,
    startTime: session.startTime,
    trainerFeedback: session.trainerFeedback || undefined,
  });
}
