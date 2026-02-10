import { kv } from "@vercel/kv";

export type LeaderboardEntry = {
  token: string;
  score: number;
  grade: string;
  createdAt: string;
  // Segmentation metadata
  personaId: string | null;
  personaDisplayName: string | null;
  jobTitle: string | null;
  // Trainee snapshot
  traineeId?: string | null;
  traineeNameShort?: string | null;
};

const inMemoryLeaderboard: LeaderboardEntry[] = [];
const MAX_LEADERBOARD_SIZE = 2000;

/**
 * KV is configured when Vercel/Upstash env vars are present.
 */
function useKv(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

/**
 * Add or update an entry in the leaderboard index
 * De-duplicates by token (replaces existing entry if token already exists)
 */
export async function addToLeaderboardIndex(
  entry: LeaderboardEntry
): Promise<void> {
  if (useKv()) {
    // Fetch existing index
    const existing = (await kv.get<LeaderboardEntry[]>("scores:index")) ?? [];

    // Remove any existing entry with same token
    const filtered = existing.filter((e) => e.token !== entry.token);

    // Add new entry at the beginning (newest first)
    const updated = [entry, ...filtered];

    // Cap at MAX_LEADERBOARD_SIZE
    const capped = updated.slice(0, MAX_LEADERBOARD_SIZE);

    // Save back to KV
    await kv.set("scores:index", capped);
  } else {
    // In-memory fallback
    // Remove any existing entry with same token
    const filtered = inMemoryLeaderboard.filter((e) => e.token !== entry.token);

    // Add new entry at the beginning
    inMemoryLeaderboard.length = 0;
    inMemoryLeaderboard.push(entry, ...filtered);

    // Cap at MAX_LEADERBOARD_SIZE
    if (inMemoryLeaderboard.length > MAX_LEADERBOARD_SIZE) {
      inMemoryLeaderboard.length = MAX_LEADERBOARD_SIZE;
    }
  }
}

/**
 * List all entries in the leaderboard index
 * Returns newest-first list
 */
export async function listLeaderboardIndex(): Promise<LeaderboardEntry[]> {
  if (useKv()) {
    const result = await kv.get<LeaderboardEntry[]>("scores:index");
    return result ?? [];
  }
  return [...inMemoryLeaderboard];
}
