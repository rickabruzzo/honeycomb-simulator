import { NextRequest, NextResponse } from "next/server";
import { getPersona, archivePersona } from "@/lib/personaStore";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const persona = await getPersona(id);

    if (!persona) {
      return NextResponse.json(
        { error: "Persona not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ persona });
  } catch (error) {
    console.error("Failed to get persona:", error);
    return NextResponse.json(
      { error: "Failed to load persona" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const success = await archivePersona(id);

    if (!success) {
      return NextResponse.json(
        { error: "Persona not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to archive persona:", error);
    return NextResponse.json(
      { error: "Failed to archive persona" },
      { status: 500 }
    );
  }
}
