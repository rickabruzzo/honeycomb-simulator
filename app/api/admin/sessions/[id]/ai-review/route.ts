import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/storage";
import { getInviteForSession } from "@/lib/invites";
import { getScore } from "@/lib/scoreStore";
import { getChatProvider } from "@/lib/llm/chatProvider";
import {
  SESSION_REVIEW_SYSTEM_PROMPT,
  buildSessionReviewMessage,
} from "@/lib/scoring/sessionReview";
import { withSpan } from "@/lib/telemetry";

/**
 * POST /api/admin/sessions/[id]/ai-review
 * Admin-only (everything under /api/admin is gated by proxy.ts).
 *
 * Body: { focus?: string }  - optional question for the reviewer ("was listening scored fairly?")
 * Returns: { review: string, model?: string }
 *
 * Nothing is persisted: the admin decides what (if anything) to save as a trainer note.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withSpan(
    "hc.event.ai_session_review",
    async (span) => {
      const { id } = await params;
      span.setAttribute("session_id", id);

      const session = await getSession(id);
      if (!session) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
      }

      const body = (await request.json().catch(() => ({}))) as { focus?: unknown };
      const focus = typeof body.focus === "string" ? body.focus : undefined;
      span.setAttribute("has_focus", !!focus);

      const token = await getInviteForSession(id).catch(() => null);
      const score = token ? await getScore(token).catch(() => null) : null;

      try {
        const result = await getChatProvider().generate({
          systemPrompt: SESSION_REVIEW_SYSTEM_PROMPT,
          conversation: [
            { role: "user", content: buildSessionReviewMessage(session, score, focus) },
          ],
          // Unique per request so a re-run with a new focus is never served from the chat cache.
          sessionId: `ai-review-${id}-${Date.now()}`,
        });

        if (result.provider === "mock") {
          return NextResponse.json(
            // The factory degrades to the mock both when no provider is configured and when the
            // real one throws - either way the mock's text is not a review.
            { error: "The AI provider is unavailable (not configured, or the call failed). Try again in a moment." },
            { status: 503 }
          );
        }

        span.setAttribute("review_length", result.text.length);
        return NextResponse.json({ review: result.text, model: result.model });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        span.setAttribute("error_message", message);
        return NextResponse.json({ error: `AI review failed: ${message}` }, { status: 502 });
      }
    },
    { route: "/api/admin/sessions/[id]/ai-review", method: "POST", event_type: "ai_session_review" }
  );
}
