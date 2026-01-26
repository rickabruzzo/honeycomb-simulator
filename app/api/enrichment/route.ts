import { NextRequest, NextResponse } from "next/server";
import { getEnrichmentProvider } from "@/lib/llm/provider";
import { getEnrichment, saveEnrichment } from "@/lib/llm/enrichmentStore";
import type { EnrichmentInput } from "@/lib/llm/enrichmentTypes";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.conferenceId || typeof body.conferenceId !== "string") {
      return NextResponse.json(
        { error: "conferenceId is required" },
        { status: 400 }
      );
    }

    if (!body.personaId || typeof body.personaId !== "string") {
      return NextResponse.json(
        { error: "personaId is required" },
        { status: 400 }
      );
    }

    if (!body.conferenceContext || typeof body.conferenceContext !== "string") {
      return NextResponse.json(
        { error: "conferenceContext is required" },
        { status: 400 }
      );
    }

    if (!body.attendeeProfile || typeof body.attendeeProfile !== "string") {
      return NextResponse.json(
        { error: "attendeeProfile is required" },
        { status: 400 }
      );
    }

    // Check if enrichment already exists in cache
    const cached = await getEnrichment(body.conferenceId, body.personaId);
    if (cached) {
      return NextResponse.json({ enrichment: cached, fromCache: true });
    }

    // Generate new enrichment
    const provider = getEnrichmentProvider();
    const input: EnrichmentInput = {
      conferenceId: body.conferenceId,
      personaId: body.personaId,
      traineeId: body.traineeId,
      conferenceContext: body.conferenceContext,
      attendeeProfile: body.attendeeProfile,
    };

    const enrichment = await provider.enrich(input);

    // Save to cache
    await saveEnrichment(enrichment);

    return NextResponse.json({ enrichment, fromCache: false });
  } catch (error) {
    console.error("Enrichment generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate enrichment" },
      { status: 500 }
    );
  }
}
