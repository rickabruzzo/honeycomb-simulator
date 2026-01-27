import { NextRequest, NextResponse } from "next/server";
import {
  listConferences,
  upsertConference,
  ensureConferencesSeeded,
  findConferenceByName,
  archiveConference,
} from "@/lib/conferenceStore";
import { Conference } from "@/lib/scenarioTypes";
import { invalidateBootstrapCache } from "@/lib/memoryStore";

export async function GET() {
  try {
    // Ensure seeded on first access
    await ensureConferencesSeeded();

    const conferences = await listConferences(false); // Exclude archived
    return NextResponse.json({ conferences });
  } catch (error) {
    console.error("Failed to list conferences:", error);
    return NextResponse.json(
      { error: "Failed to load conferences" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.name || typeof body.name !== "string") {
      return NextResponse.json(
        { error: "Missing required field: name" },
        { status: 400 }
      );
    }

    // Check for overwrite when creating new conference (no id provided)
    if (!body.id) {
      const existing = await findConferenceByName(body.name);
      if (existing) {
        return NextResponse.json(
          {
            error: "Conference already exists",
            existingId: existing.id,
            existingConference: existing,
            action: "overwrite",
          },
          { status: 409 }
        );
      }
    }

    // If archiveExistingId is provided, archive it first before creating new
    if (body.archiveExistingId) {
      await archiveConference(body.archiveExistingId);
    }

    // Upsert conference (creates if missing id, updates if present)
    const conference = await upsertConference(
      body as Partial<Conference> & { name: string }
    );

    // Invalidate bootstrap cache so changes appear immediately
    invalidateBootstrapCache();

    return NextResponse.json({ conference });
  } catch (error) {
    console.error("Failed to upsert conference:", error);
    return NextResponse.json(
      { error: "Failed to save conference" },
      { status: 500 }
    );
  }
}
