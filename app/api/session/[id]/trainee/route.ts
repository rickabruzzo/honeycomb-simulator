import { NextResponse } from "next/server";
import { getSession } from "@/lib/storage";

/**
 * Trainee-safe session endpoint that redacts kickoff.attendeeProfile
 * to prevent exposing the hidden profile to the browser.
 */
export async function GET(req: Request, ctx: any) {
  // Works across Next 15 / 16 / Turbopack
  const { id } = await Promise.resolve(ctx.params);

  if (!id) {
    return NextResponse.json({ error: "Missing session id" }, { status: 400 });
  }

  const session = await getSession(id);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Redact attendeeProfile from kickoff
  const redactedKickoff = {
    personaId: session.kickoff.personaId,
    // attendeeProfile is intentionally omitted
  };

  return NextResponse.json({
    sessionId: session.id,
    transcript: session.transcript,
    currentState: session.currentState,
    violations: session.violations ?? [],
    active: session.active,
    kickoff: redactedKickoff,
    startTime: session.startTime,
  });
}
