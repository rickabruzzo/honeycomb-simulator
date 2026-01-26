import { NextRequest, NextResponse } from "next/server";
import { getTrainee, archiveTrainee, ensureTraineesSeeded } from "@/lib/traineeStore";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureTraineesSeeded();
    const { id } = await params;
    const trainee = await getTrainee(id);

    if (!trainee) {
      return NextResponse.json(
        { error: "Trainee not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ trainee });
  } catch (error) {
    console.error("Failed to get trainee:", error);
    return NextResponse.json(
      { error: "Failed to load trainee" },
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
    const success = await archiveTrainee(id);

    if (!success) {
      return NextResponse.json(
        { error: "Trainee not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to archive trainee:", error);
    return NextResponse.json(
      { error: "Failed to archive trainee" },
      { status: 500 }
    );
  }
}
