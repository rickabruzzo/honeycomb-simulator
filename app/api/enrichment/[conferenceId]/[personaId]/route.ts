import { NextRequest, NextResponse } from "next/server";
import {
  getEnrichment,
  invalidateEnrichment,
} from "@/lib/llm/enrichmentStore";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conferenceId: string; personaId: string }> }
) {
  try {
    const { conferenceId, personaId } = await params;
    const enrichment = await getEnrichment(conferenceId, personaId);

    if (!enrichment) {
      return NextResponse.json(
        { error: "Enrichment not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ enrichment });
  } catch (error) {
    console.error("Failed to get enrichment:", error);
    return NextResponse.json(
      { error: "Failed to load enrichment" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ conferenceId: string; personaId: string }> }
) {
  try {
    const { conferenceId, personaId } = await params;
    await invalidateEnrichment(conferenceId, personaId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to invalidate enrichment:", error);
    return NextResponse.json(
      { error: "Failed to invalidate enrichment" },
      { status: 500 }
    );
  }
}
