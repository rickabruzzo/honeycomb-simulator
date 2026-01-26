import { NextRequest, NextResponse } from "next/server";
import { listScores } from "@/lib/scoreStore";
import { computeInsights } from "@/lib/insights";
import type { ScoreRecord } from "@/lib/scoring";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const range = (searchParams.get("range") as "7d" | "30d" | "all") || "7d";
    const conferenceId = searchParams.get("conferenceId") || undefined;
    const personaId = searchParams.get("personaId") || undefined;
    const traineeId = searchParams.get("traineeId") || undefined;

    // Fetch scores from store
    const allScores = await listScores({ range, limit: 5000 });

    // Apply filters
    let filtered: ScoreRecord[] = allScores;

    if (conferenceId) {
      filtered = filtered.filter(
        (score) => score.conferenceId === conferenceId
      );
    }

    if (personaId) {
      filtered = filtered.filter((score) => score.personaId === personaId);
    }

    if (traineeId) {
      filtered = filtered.filter((score) => score.traineeId === traineeId);
    }

    // Compute insights
    const insights = computeInsights(filtered);

    return NextResponse.json({
      insights,
      totalScores: allScores.length,
      filteredScores: filtered.length,
      range,
    });
  } catch (error) {
    console.error("Failed to fetch insights:", error);
    return NextResponse.json(
      { error: "Failed to load insights" },
      { status: 500 }
    );
  }
}
