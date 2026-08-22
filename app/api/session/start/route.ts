import { NextRequest, NextResponse } from 'next/server';
import { saveSession } from '@/lib/storage';
import { createSessionWithEnrichment } from '@/lib/createSession';
import { withSpan } from '@/lib/telemetry';

export async function POST(request: NextRequest) {
  return withSpan(
    "hc.event.session_start",
    async (span) => {
      span.setAttribute("route", "/api/session/start");
      span.setAttribute("method", "POST");
      span.setAttribute("event_type", "session_start");

      try {
        const body = await request.json();

        if (body.personaId) {
          span.setAttribute("persona_id", body.personaId);
        }
        const result = await createSessionWithEnrichment({
          personaId: body.personaId,
          attendeeProfile: body.attendeeProfile,
        });

        if (result.error) {
          span.setAttribute("status", 400);
          span.setAttribute("error", result.error);
          return new Response(
            JSON.stringify({ error: result.error }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }

        const session = result.session;
        await saveSession(session);

        span.setAttribute("session_id", session.id);
        span.setAttribute("current_state", session.currentState);
        span.setAttribute("enrichment_used", !!session.kickoff.enrichment);
        span.setAttribute("status", 200);

        return NextResponse.json({
          sessionId: session.id,
          transcript: session.transcript,
          currentState: session.currentState
        });
      } catch (error) {
        console.error('Start session error:', error);

        span.setAttribute("status", 500);
        span.setAttribute("error_message", error instanceof Error ? error.message : "Unknown error");

        return NextResponse.json(
          { error: 'Failed to start session' },
          { status: 500 }
        );
      }
    },
    { route: "/api/session/start", method: "POST", event_type: "session_start" }
  );
}