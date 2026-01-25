import { NextRequest, NextResponse } from "next/server";
import { getConference, archiveConference } from "@/lib/conferenceStore";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const conference = await getConference(id);

    if (!conference) {
      return NextResponse.json(
        { error: "Conference not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ conference });
  } catch (error) {
    console.error("Failed to get conference:", error);
    return NextResponse.json(
      { error: "Failed to load conference" },
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
    const success = await archiveConference(id);

    if (!success) {
      return NextResponse.json(
        { error: "Conference not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to archive conference:", error);
    return NextResponse.json(
      { error: "Failed to archive conference" },
      { status: 500 }
    );
  }
}
