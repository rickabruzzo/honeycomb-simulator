import { NextRequest, NextResponse } from "next/server";
import { ensureEnrichment } from "@/lib/llm/ensureEnrichment";
import { withSpan } from "@/lib/telemetry";

/**
 * POST /api/enrichment/ensure
 * Background endpoint to ensure enrichment exists for a conference/persona pair
 *
 * This endpoint is called asynchronously after invite creation to generate
 * enrichment without blocking the invite creation flow.
 *
 * Request body:
 * - conferenceId: string
 * - personaId: string
 * - conferenceContext: string
 * - attendeeProfile: string
 */
export async function POST(request: NextRequest) {
  return withSpan(
    "hc.event.enrichment_ensure",
    async (span) => {
      span.setAttribute("route", "/api/enrichment/ensure");
      span.setAttribute("method", "POST");
      span.setAttribute("event_type", "enrichment_ensure");

      try {
        const body = await request.json();
        const { conferenceId, personaId, conferenceContext, attendeeProfile } = body;

        if (!conferenceId || !personaId) {
          span.setAttribute("status", 400);
          span.setAttribute("error", "Missing required fields");
          return NextResponse.json(
            { error: "conferenceId and personaId are required" },
            { status: 400 }
          );
        }

        span.setAttribute("conference_id", conferenceId);
        span.setAttribute("persona_id", personaId);

        // All cache-check / generate / timeout / save logic lives in ensureEnrichment so this
        // endpoint and the invite-create background task can never drift apart.
        const result = await ensureEnrichment({
          conferenceId,
          personaId,
          conferenceContext,
          attendeeProfile,
        });

        span.setAttribute("enrichment_status", result.status);
        span.setAttribute("cache_hit", result.status === "cached");
        if (result.provider) span.setAttribute("provider", result.provider);
        if (result.error) span.setAttribute("enrichment_error", result.error);

        if (result.status === "pending") {
          span.setAttribute("status", 202);
          return NextResponse.json(result, { status: 202 });
        }

        span.setAttribute("status", 200);
        return NextResponse.json(result);
      } catch (error) {
        console.error("[enrichment/ensure] Error:", error);
        span.setAttribute("status", 500);
        span.setAttribute("error", error instanceof Error ? error.message : "Unknown error");

        return NextResponse.json(
          { error: "Failed to ensure enrichment" },
          { status: 500 }
        );
      }
    },
    { route: "/api/enrichment/ensure", method: "POST", event_type: "enrichment_ensure" }
  );
}
