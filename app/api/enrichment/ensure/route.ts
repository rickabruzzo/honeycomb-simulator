import { NextRequest, NextResponse } from "next/server";
import { getEnrichment, saveEnrichment } from "@/lib/llm/enrichmentStore";
import { getEnrichmentProvider } from "@/lib/llm/provider";
import type { EnrichmentInput } from "@/lib/llm/enrichmentTypes";
import { withSpan, withChildSpan } from "@/lib/telemetry";

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

        // Check cache first
        const cached = await withChildSpan(
          "hc.dep.kv.enrichment_cache_check",
          async (childSpan) => {
            childSpan.setAttribute("dep_type", "kv");
            childSpan.setAttribute("operation", "get");
            const result = await getEnrichment(conferenceId, personaId);
            childSpan.setAttribute("cache_hit", !!result);
            return result;
          }
        );

        if (cached) {
          span.setAttribute("enrichment_status", "cached");
          span.setAttribute("cache_hit", true);
          span.setAttribute("status", 200);

          return NextResponse.json({
            status: "cached",
            provider: cached.provider,
          });
        }

        // Generate enrichment with timeout
        if (!conferenceContext || !attendeeProfile) {
          span.setAttribute("status", 400);
          span.setAttribute("error", "Missing context for generation");
          return NextResponse.json(
            { error: "conferenceContext and attendeeProfile required for generation" },
            { status: 400 }
          );
        }

        const provider = getEnrichmentProvider();
        const providerType: string = process.env.ENRICHMENT_PROVIDER || "mock";

        const enrichmentInput: EnrichmentInput = {
          conferenceId,
          personaId,
          conferenceContext,
          attendeeProfile,
        };

        // Generate with 8s timeout
        const timeoutPromise = new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error("Enrichment timeout")), 8000)
        );

        let enrichment;
        try {
          enrichment = await withChildSpan(
            "hc.dep.enrichment.generate",
            async (childSpan) => {
              childSpan.setAttribute("dep_type", "enrichment");
              childSpan.setAttribute("provider", providerType);

              const result = await Promise.race([
                provider.enrich(enrichmentInput),
                timeoutPromise,
              ]);

              if (result) {
                childSpan.setAttribute("success", true);
              }

              return result;
            }
          );
        } catch (error) {
          // Timeout or error - log but don't fail
          console.error("[enrichment/ensure] Generation failed:", error);
          span.setAttribute("enrichment_error", error instanceof Error ? error.message : "Unknown");
          span.setAttribute("status", 202);

          return NextResponse.json({
            status: "pending",
            error: "Generation failed or timed out",
          }, { status: 202 });
        }

        if (!enrichment) {
          span.setAttribute("status", 202);
          return NextResponse.json({
            status: "pending",
            error: "No enrichment generated",
          }, { status: 202 });
        }

        // Save to cache
        await withChildSpan(
          "hc.dep.kv.enrichment_save",
          async (childSpan) => {
            childSpan.setAttribute("dep_type", "kv");
            childSpan.setAttribute("operation", "set");
            await saveEnrichment(enrichment);
          }
        );

        span.setAttribute("enrichment_status", "fresh");
        span.setAttribute("provider", enrichment.provider || "unknown");
        span.setAttribute("cache_hit", false);
        span.setAttribute("status", 200);

        return NextResponse.json({
          status: "fresh",
          provider: enrichment.provider,
        });
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
