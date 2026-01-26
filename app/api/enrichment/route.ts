import { NextRequest, NextResponse } from "next/server";
import { getEnrichmentProvider } from "@/lib/llm/provider";
import { getEnrichment, saveEnrichment } from "@/lib/llm/enrichmentStore";
import type { EnrichmentInput } from "@/lib/llm/enrichmentTypes";
import { withSpan, withChildSpan } from "@/lib/telemetry";

export async function POST(request: NextRequest) {
  return withSpan(
    "hc.event.enrichment",
    async (span) => {
      span.setAttribute("route", "/api/enrichment");
      span.setAttribute("method", "POST");
      span.setAttribute("event_type", "enrichment");

      try {
        const body = await request.json();

        // Validate required fields
        if (!body.conferenceId || typeof body.conferenceId !== "string") {
          span.setAttribute("status", 400);
          span.setAttribute("error", "conference_id_required");
          return NextResponse.json(
            { error: "conferenceId is required" },
            { status: 400 }
          );
        }

        if (!body.personaId || typeof body.personaId !== "string") {
          span.setAttribute("status", 400);
          span.setAttribute("error", "persona_id_required");
          return NextResponse.json(
            { error: "personaId is required" },
            { status: 400 }
          );
        }

        if (!body.conferenceContext) {
          span.setAttribute("status", 400);
          span.setAttribute("error", "conference_context_required");
          return NextResponse.json(
            { error: "conferenceContext is required" },
            { status: 400 }
          );
        }

        if (!body.attendeeProfile) {
          span.setAttribute("status", 400);
          span.setAttribute("error", "attendee_profile_required");
          return NextResponse.json(
            { error: "attendeeProfile is required" },
            { status: 400 }
          );
        }

        span.setAttribute("conference_id", body.conferenceId);
        span.setAttribute("persona_id", body.personaId);
        if (body.traineeId) {
          span.setAttribute("trainee_id", body.traineeId);
        }

        // Normalize inputs: accept both string and object formats
        const conferenceContext =
          typeof body.conferenceContext === "string"
            ? body.conferenceContext
            : JSON.stringify(body.conferenceContext);

        const attendeeProfile =
          typeof body.attendeeProfile === "string"
            ? body.attendeeProfile
            : JSON.stringify(body.attendeeProfile);

        // Check if enrichment already exists in cache
        const cached = await getEnrichment(body.conferenceId, body.personaId);
        if (cached) {
          span.setAttribute("cache_hit", true);
          span.setAttribute("status", 200);
          return NextResponse.json({ enrichment: cached, fromCache: true });
        }

        span.setAttribute("cache_hit", false);

        // Generate new enrichment
        const provider = getEnrichmentProvider();
        const input: EnrichmentInput = {
          conferenceId: body.conferenceId,
          personaId: body.personaId,
          traineeId: body.traineeId,
          conferenceContext,
          attendeeProfile,
        };

        const enrichment = await withChildSpan(
          "hc.dep.enrichment.generate",
          async (childSpan) => {
            childSpan.setAttribute("dep_type", "enrichment");
            childSpan.setAttribute("conference_id", body.conferenceId);
            childSpan.setAttribute("persona_id", body.personaId);

            const result = await provider.enrich(input);

            if (result.provider) {
              childSpan.setAttribute("provider", result.provider);
            }

            return result;
          },
          { dep_type: "enrichment" }
        );

        // Save to cache
        await saveEnrichment(enrichment);

        if (enrichment.provider) {
          span.setAttribute("enrichment_provider", enrichment.provider);
        }
        span.setAttribute("status", 200);

        return NextResponse.json({ enrichment, fromCache: false });
      } catch (error) {
        console.error("Enrichment generation error:", error);

        span.setAttribute("status", 500);
        span.setAttribute("error_message", error instanceof Error ? error.message : "Unknown error");

        return NextResponse.json(
          { error: "Failed to generate enrichment" },
          { status: 500 }
        );
      }
    },
    { route: "/api/enrichment", method: "POST", event_type: "enrichment" }
  );
}
