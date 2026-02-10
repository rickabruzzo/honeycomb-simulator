import { NextResponse } from "next/server";
import { getSession } from "@/lib/storage";

export async function GET(req: Request, ctx: any) {
  // Works across Next 15 / 16 / Turbopack
  const { id } = await Promise.resolve(ctx.params);

  if (!id) {
    return NextResponse.json(
      { error: "Missing session id" },
      { status: 400 }
    );
  }

  const session = await getSession(id);

  if (!session) {
    return NextResponse.json(
      { error: "Session not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    sessionId: session.id,
    transcript: session.transcript,
    currentState: session.currentState,
    stateHistory: session.stateHistory ?? [],
    violations: session.violations ?? [],
    active: session.active,
    kickoff: session.kickoff,
    startTime: session.startTime,
    decisionTrace: session.decisionTrace,
  });
}