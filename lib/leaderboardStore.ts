import { kv } from "@vercel/kv";

import { useKv } from "./kvConfig";
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
  /** True when the session was run in training-wheels (assisted) mode. */
  trainingWheels?: boolean;
};

// Dedicated leaderboard key. Previously this shared "scores:index" with the score store, which
// writes bare token strings there — the two shapes collided and the board reported phantom
// "N total" counts. The leaderboard now owns "leaderboard:index" (a clean LeaderboardEntry[]).
const LEADERBOARD_KEY = "leaderboard:index";
const inMemoryLeaderboard: LeaderboardEntry[] = [];
const MAX_LEADERBOARD_SIZE = 2000;

/** Keep only well-formed entry objects (guards against any legacy mixed data). */
function onlyEntries(list: unknown): LeaderboardEntry[] {
  if (!Array.isArray(list)) return [];
  return list.filter(
    (e): e is LeaderboardEntry =>
      Boolean(e) && typeof e === "object" && typeof (e as LeaderboardEntry).token === "string"
  );
}

/**
 * Add or update an entry in the leaderboard index
 * De-duplicates by token (replaces existing entry if token already exists)
 */
export async function addToLeaderboardIndex(entry: LeaderboardEntry): Promise<void> {
  if (useKv()) {
    const existing = onlyEntries(await kv.get<unknown>(LEADERBOARD_KEY));
    const filtered = existing.filter((e) => e.token !== entry.token);
    const capped = [entry, ...filtered].slice(0, MAX_LEADERBOARD_SIZE);
    await kv.set(LEADERBOARD_KEY, capped);
  } else {
    const filtered = inMemoryLeaderboard.filter((e) => e.token !== entry.token);
    inMemoryLeaderboard.length = 0;
    inMemoryLeaderboard.push(entry, ...filtered);
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
    return onlyEntries(await kv.get<unknown>(LEADERBOARD_KEY));
  }
  return [...inMemoryLeaderboard];
}

/**
 * Remove a single entry from the leaderboard by its token. Returns true if an entry was removed.
 */
export async function removeFromLeaderboardIndex(token: string): Promise<boolean> {
  if (useKv()) {
    const existing = onlyEntries(await kv.get<unknown>(LEADERBOARD_KEY));
    const filtered = existing.filter((e) => e.token !== token);
    if (filtered.length === existing.length) return false;
    await kv.set(LEADERBOARD_KEY, filtered);
    return true;
  }
  const before = inMemoryLeaderboard.length;
  const kept = inMemoryLeaderboard.filter((e) => e.token !== token);
  inMemoryLeaderboard.length = 0;
  inMemoryLeaderboard.push(...kept);
  return kept.length !== before;
}

/**
 * Clear the entire leaderboard index. Returns how many entries were removed.
 */
export async function clearLeaderboard(): Promise<number> {
  if (useKv()) {
    const existing = onlyEntries(await kv.get<unknown>(LEADERBOARD_KEY));
    await kv.set(LEADERBOARD_KEY, []);
    return existing.length;
  }
  const n = inMemoryLeaderboard.length;
  inMemoryLeaderboard.length = 0;
  return n;
}
