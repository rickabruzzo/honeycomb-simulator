import { NextRequest, NextResponse } from "next/server";
import { listLeaderboardIndex, LeaderboardEntry } from "@/lib/leaderboardStore";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const range = searchParams.get("range") || "7d"; // Default to 7d
    const personaId = searchParams.get("personaId") || undefined;
    const traineeId = searchParams.get("traineeId") || undefined;
    const jobTitle = searchParams.get("jobTitle") || undefined;
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 200) : 20;

    // Fetch all entries
    const allEntries = await listLeaderboardIndex();
    const totalStored = allEntries.length;

    // Apply range filter
    let entries = allEntries;
    if (range !== "all") {
      const now = new Date();
      let cutoffTime: Date;

      switch (range) {
        case "24h":
          cutoffTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case "7d":
          cutoffTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "30d":
          cutoffTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          cutoffTime = new Date(0);
      }

      entries = entries.filter((entry) => {
        const entryTime = new Date(entry.createdAt);
        return entryTime >= cutoffTime;
      });
    }

    // Apply persona filter
    if (personaId) {
      entries = entries.filter(
        (entry) => entry.personaId === personaId
      );
    }

    // Apply trainee filter
    if (traineeId) {
      entries = entries.filter(
        (entry) => entry.traineeId === traineeId
      );
    }

    // Apply job title filter (convenience filter)
    if (jobTitle) {
      entries = entries.filter(
        (entry) => entry.jobTitle?.toLowerCase() === jobTitle.toLowerCase()
      );
    }

    const totalMatched = entries.length;

    // Sort by score desc, then createdAt desc (recency tie-break)
    entries.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // Limit results
    const topEntries = entries.slice(0, limit);

    return NextResponse.json({
      entries: topEntries,
      totalMatched,
      totalStored,
      rangeUsed: range,
      limitUsed: limit,
    });
  } catch (error) {
    console.error("Failed to fetch leaderboard:", error);
    return NextResponse.json(
      { error: "Failed to load leaderboard" },
      { status: 500 }
    );
  }
}
