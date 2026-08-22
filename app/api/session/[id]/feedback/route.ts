import { NextRequest, NextResponse } from "next/server";
import { getSession, saveSession } from "@/lib/storage";
import { withSpan } from "@/lib/telemetry";

/**
 * GET /api/session/[id]/feedback
 * Retrieve trainer feedback for a session
 *
 * Returns:
 * {
 *   feedback: {
 *     guidance: string,
 *     applyToScenario?: boolean,
 *     updatedAt: string,
 *     updatedBy?: string
 *   } | null
 * }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withSpan(
    "hc.event.get_feedback",
    async (span) => {
      const { id } = await params;

      span.setAttribute("route", "/api/session/[id]/feedback");
      span.setAttribute("method", "GET");
      span.setAttribute("event_type", "get_feedback");
      span.setAttribute("session_id", id);

      try {
        const session = await getSession(id);

        if (!session) {
          span.setAttribute("status", 404);
          return NextResponse.json(
            { error: "Session not found" },
            { status: 404 }
          );
        }

        span.setAttribute("status", 200);
        span.setAttribute("has_feedback", !!session.trainerFeedback);

        return NextResponse.json({
          feedback: session.trainerFeedback || null,
        });
      } catch (error) {
        console.error("[Feedback] Failed to retrieve feedback:", error);

        span.setAttribute("status", 500);
        span.setAttribute(
          "error_message",
          error instanceof Error ? error.message : "Unknown error"
        );

        return NextResponse.json(
          { error: "Failed to retrieve feedback" },
          { status: 500 }
        );
      }
    },
    { route: "/api/session/[id]/feedback", method: "GET", event_type: "get_feedback" }
  );
}

/**
 * POST /api/session/[id]/feedback
 * Save trainer feedback for a session
 *
 * Request body:
 * {
 *   guidance: string,          // Required: The trainer's guidance text
 *   applyToScenario?: boolean, // Optional: Whether to update the scenario preset
 *   updatedBy?: string         // Optional: Identifier for who made the update
 * }
 *
 * Returns:
 * {
 *   success: true,
 *   feedback: {
 *     guidance: string,
 *     applyToScenario?: boolean,
 *     updatedAt: string,
 *     updatedBy?: string
 *   }
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withSpan(
    "hc.event.save_feedback",
    async (span) => {
      const { id } = await params;

      span.setAttribute("route", "/api/session/[id]/feedback");
      span.setAttribute("method", "POST");
      span.setAttribute("event_type", "save_feedback");
      span.setAttribute("session_id", id);

      try {
        const session = await getSession(id);

        if (!session) {
          span.setAttribute("status", 404);
          return NextResponse.json(
            { error: "Session not found" },
            { status: 404 }
          );
        }

        const body = await request.json();

        if (!body.guidance || typeof body.guidance !== "string") {
          span.setAttribute("status", 400);
          return NextResponse.json(
            { error: "Missing required field: guidance" },
            { status: 400 }
          );
        }

        // Update session with trainer feedback
        session.trainerFeedback = {
          guidance: body.guidance,
          applyToScenario: body.applyToScenario || false,
          updatedAt: new Date().toISOString(),
          updatedBy: body.updatedBy,
        };

        span.setAttribute("guidance_length", body.guidance.length);
        span.setAttribute("apply_to_scenario", session.trainerFeedback.applyToScenario || false);

        // Save session
        await saveSession(session);

        // TODO: If applyToScenario is true, update the persona notes
        // This requires persona update logic which can be added later
        if (session.trainerFeedback.applyToScenario) {
          console.log(
            `[Feedback] TODO: Apply guidance to scenario (persona: ${session.kickoff.personaId})`
          );
          span.setAttribute("scenario_update_pending", true);
        }

        span.setAttribute("status", 200);

        return NextResponse.json({
          success: true,
          feedback: session.trainerFeedback,
        });
      } catch (error) {
        console.error("[Feedback] Failed to save feedback:", error);

        span.setAttribute("status", 500);
        span.setAttribute(
          "error_message",
          error instanceof Error ? error.message : "Unknown error"
        );

        return NextResponse.json(
          { error: "Failed to save feedback" },
          { status: 500 }
        );
      }
    },
    { route: "/api/session/[id]/feedback", method: "POST", event_type: "save_feedback" }
  );
}

/**
 * DELETE /api/session/[id]/feedback
 * Remove trainer feedback from a session
 *
 * Returns:
 * {
 *   success: true
 * }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withSpan(
    "hc.event.delete_feedback",
    async (span) => {
      const { id } = await params;

      span.setAttribute("route", "/api/session/[id]/feedback");
      span.setAttribute("method", "DELETE");
      span.setAttribute("event_type", "delete_feedback");
      span.setAttribute("session_id", id);

      try {
        const session = await getSession(id);

        if (!session) {
          span.setAttribute("status", 404);
          return NextResponse.json(
            { error: "Session not found" },
            { status: 404 }
          );
        }

        // Remove trainer feedback
        delete session.trainerFeedback;

        // Save session
        await saveSession(session);

        span.setAttribute("status", 200);

        return NextResponse.json({
          success: true,
        });
      } catch (error) {
        console.error("[Feedback] Failed to delete feedback:", error);

        span.setAttribute("status", 500);
        span.setAttribute(
          "error_message",
          error instanceof Error ? error.message : "Unknown error"
        );

        return NextResponse.json(
          { error: "Failed to delete feedback" },
          { status: 500 }
        );
      }
    },
    { route: "/api/session/[id]/feedback", method: "DELETE", event_type: "delete_feedback" }
  );
}
