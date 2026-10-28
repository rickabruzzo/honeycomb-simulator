import { NextRequest, NextResponse } from "next/server";
import { createInvite } from "@/lib/createInvite";

/**
 * Builder: create a practice link for a chosen persona + trainee. The work (session, invite,
 * tracker row, background enrichment, telemetry) lives in lib/createInvite.ts, shared with the
 * self-serve /api/start flow.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.traineeId || typeof body.traineeId !== "string") {
      return NextResponse.json({ error: "traineeId is required" }, { status: 400 });
    }
    if (!body.personaId || typeof body.personaId !== "string") {
      return NextResponse.json({ error: "personaId is required" }, { status: 400 });
    }

    const result = await createInvite({
      personaId: body.personaId,
      traineeId: body.traineeId,
      traineeName: typeof body.traineeName === "string" ? body.traineeName : undefined,
      attendeeProfile: typeof body.attendeeProfile === "string" ? body.attendeeProfile : undefined,
      trainingWheels: Boolean(body.trainingWheels),
      createdBy: typeof body.createdBy === "string" ? body.createdBy : undefined,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      token: result.token,
      sessionId: result.sessionId,
      url: result.url,
      enrichment: result.enrichment,
    });
  } catch (error) {
    console.error("[invite/create] Error:", error);
    return NextResponse.json({ error: "Failed to create invite" }, { status: 500 });
  }
}
