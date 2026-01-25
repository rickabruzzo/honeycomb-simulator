import { NextRequest, NextResponse } from "next/server";
import {
  listPersonas,
  upsertPersona,
  ensurePersonasSeeded,
} from "@/lib/personaStore";
import { Persona } from "@/lib/scenarioTypes";

export async function GET() {
  try {
    // Ensure seeded on first access
    await ensurePersonasSeeded();

    const personas = await listPersonas(false); // Exclude archived
    return NextResponse.json({ personas });
  } catch (error) {
    console.error("Failed to list personas:", error);
    return NextResponse.json(
      { error: "Failed to load personas" },
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

    // Upsert persona (creates if missing id, updates if present)
    const persona = await upsertPersona(body as Partial<Persona> & { name: string });

    return NextResponse.json({ persona });
  } catch (error) {
    console.error("Failed to upsert persona:", error);
    return NextResponse.json(
      { error: "Failed to save persona" },
      { status: 500 }
    );
  }
}
