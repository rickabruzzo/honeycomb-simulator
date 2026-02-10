import { NextRequest, NextResponse } from "next/server";
import { getSession, saveSession } from "@/lib/storage";
import { randomUUID } from "crypto";
import { getInviteForSession } from "@/lib/invites";
import { scoreSession } from "@/lib/scoring";
import { saveScore } from "@/lib/scoreStore";
import { addToLeaderboardIndex } from "@/lib/leaderboardStore";
import { getOutcomeAction, type OutcomeActionType } from "@/lib/outcomeActions";
import { withSpan } from "@/lib/telemetry";

/**
 * Complete a session with an explicit outcome action.
 *
 * This endpoint:
 * 1. Appends a system message describing the action
 * 2. Marks session as inactive
 * 3. Generates and saves score
 * 4. Returns shareUrl for redirect
 *
 * This replaces the auto-end flow with an explicit user action.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withSpan(
    "hc.event.session_complete",
    async (span) => {
      const { id } = await params;

      span.setAttribute("route", "/api/session/[id]/complete");
      span.setAttribute("method", "POST");
      span.setAttribute("event_type", "session_complete");
      span.setAttribute("session_id", id);

      try {
        const session = await getSession(id);
        if (!session) {
          span.setAttribute("status", 404);
          span.setAttribute("error", "session_not_found");
          return NextResponse.json(
            { error: "Session not found" },
            { status: 404 }
          );
        }

        if (!session.active) {
          span.setAttribute("status", 400);
          span.setAttribute("error", "session_already_completed");
          return NextResponse.json(
            { error: "Session already completed" },
            { status: 400 }
          );
        }

        const { actionType } = await request.json();

        if (!actionType) {
          span.setAttribute("status", 400);
          span.setAttribute("error", "missing_action_type");
          return NextResponse.json(
            { error: "actionType is required" },
            { status: 400 }
          );
        }

        span.setAttribute("action_type", actionType);

        // 1) Determine final outcome (prefer stored pendingOutcome)
        const outcome = session.pendingOutcome || "POLITE_EXIT";
        span.setAttribute("final_outcome", outcome);

        // 2) Get action configuration
        const action = getOutcomeAction(outcome);

        // 3) Append system message describing the action
        const completionMessage = {
          id: randomUUID(),
          type: "system" as const,
          text: action.systemMessage,
          timestamp: new Date().toISOString(),
        };
        session.transcript.push(completionMessage);

        // 4) Mark session as complete
        session.active = false;

        // 5) Generate and save score
        let shareUrl: string | null = null;
        let grade: string | null = null;
        let score: number | null = null;

        try {
          const token = await getInviteForSession(id);

          if (token) {
            span.setAttribute("has_token", true);

            // Generate score
            const scoreRecord = scoreSession(session, token);
            await saveScore(scoreRecord);

            shareUrl = `/share/${token}`;
            grade = scoreRecord.grade;
            score = scoreRecord.score;

            span.setAttribute("score", scoreRecord.score);
            span.setAttribute("grade", scoreRecord.grade);

            // Add to leaderboard
            await addToLeaderboardIndex({
              token: scoreRecord.token,
              score: scoreRecord.score,
              grade: scoreRecord.grade,
              createdAt: scoreRecord.completedAt,
              conferenceId: scoreRecord.conferenceId || null,
              conferenceName: scoreRecord.conferenceName || null,
              personaId: scoreRecord.personaId || null,
              personaDisplayName: scoreRecord.personaDisplayName || null,
              jobTitle: null,
              difficulty: (scoreRecord.difficulty as "easy" | "medium" | "hard") || null,
              traineeId: scoreRecord.traineeId || null,
              traineeNameShort: scoreRecord.traineeNameShort || null,
            });

            span.setAttribute("leaderboard_added", true);
          } else {
            span.setAttribute("has_token", false);
            console.warn("[complete] No token found for session:", id);
          }
        } catch (error) {
          console.error("[complete] Failed to generate score:", error);
          span.setAttribute("scoring_error", true);
          // Continue - still complete the session even if scoring fails
        }

        // 6) Persist session
        await saveSession(session);

        span.setAttribute("status", 200);

        return NextResponse.json({
          ok: true,
          outcome,
          shareUrl,
          grade,
          score,
          actionType: action.actionType,
        });
      } catch (error) {
        console.error("[complete] Error:", error);

        span.setAttribute("status", 500);
        span.setAttribute("error_message", error instanceof Error ? error.message : "Unknown error");

        return NextResponse.json(
          { error: "Failed to complete session" },
          { status: 500 }
        );
      }
    },
    { route: "/api/session/[id]/complete", method: "POST", event_type: "session_complete" }
  );
}
