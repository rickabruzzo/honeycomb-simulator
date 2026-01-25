import { NextRequest, NextResponse } from "next/server";
import { listLeaderboardIndex, LeaderboardEntry } from "@/lib/leaderboardStore";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const range = searchParams.get("range") || "all"; // "24h" | "7d" | "30d" | "all"
    const personaId = searchParams.get("personaId") || undefined;
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 200) : 20;

    // Fetch all entries
    let entries = await listLeaderboardIndex();

    // Apply range filter
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
          cutoffTime = new Date(0); // No filter
      }

      entries = entries.filter((entry) => {
        const entryTime = new Date(entry.createdAt);
        return entryTime >= cutoffTime;
      });
    }

    // Apply personaId filter
    if (personaId) {
      entries = entries.filter(
        (entry) => entry.meta?.personaId === personaId
      );
    }

    // Sort by score desc, then createdAt desc
    entries.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // Limit results
    const topEntries = entries.slice(0, limit);

    return NextResponse.json({ entries: topEntries });
  } catch (error) {
    console.error("Failed to fetch leaderboard:", error);
    return NextResponse.json(
      { error: "Failed to load leaderboard" },
      { status: 500 }
    );
  }
}
