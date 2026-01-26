import { kv } from "@vercel/kv";
import { ScoreRecord } from "./scoring";

const inMemoryScores = new Map<string, ScoreRecord>();
const inMemoryScoreIndex: string[] = [];
const MAX_SCORE_INDEX_SIZE = 5000;

/**
 * KV is configured when Vercel/Upstash env vars are present.
 */
function useKv(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export async function saveScore(record: ScoreRecord): Promise<void> {
  if (useKv()) {
    await kv.set(`score:${record.token}`, record);

    // Update index (newest first)
    const index = (await kv.get<string[]>("scores:index")) ?? [];
    const filtered = index.filter((token) => token !== record.token);
    const updated = [record.token, ...filtered].slice(0, MAX_SCORE_INDEX_SIZE);
    await kv.set("scores:index", updated);

    return;
  }

  // In-memory fallback
  inMemoryScores.set(record.token, record);

  // Update in-memory index (newest first)
  const filtered = inMemoryScoreIndex.filter((token) => token !== record.token);
  inMemoryScoreIndex.length = 0;
  inMemoryScoreIndex.push(record.token, ...filtered);
  if (inMemoryScoreIndex.length > MAX_SCORE_INDEX_SIZE) {
    inMemoryScoreIndex.length = MAX_SCORE_INDEX_SIZE;
  }
}

export async function getScore(token: string): Promise<ScoreRecord | null> {
  if (useKv()) {
    const result = await kv.get<ScoreRecord>(`score:${token}`);
    return result ?? null;
  }
  return inMemoryScores.get(token) ?? null;
}

/**
 * List scores from index (newest first)
 * Optionally filter by time range and limit results
 */
export async function listScores(options?: {
  range?: "7d" | "30d" | "all";
  limit?: number;
}): Promise<ScoreRecord[]> {
  const { range = "all", limit = 1000 } = options ?? {};

  // Get score tokens from index
  let tokens: string[];
  if (useKv()) {
    tokens = (await kv.get<string[]>("scores:index")) ?? [];
  } else {
    tokens = [...inMemoryScoreIndex];
  }

  // Fetch score records
  const scores: ScoreRecord[] = [];
  for (const token of tokens) {
    const score = await getScore(token);
    if (score) {
      scores.push(score);
    }
  }

  // Apply time range filter
  let filtered = scores;
  if (range !== "all") {
    const now = new Date();
    let cutoffTime: Date;

    switch (range) {
      case "7d":
        cutoffTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        cutoffTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        cutoffTime = new Date(0);
    }

    filtered = scores.filter((score) => {
      const scoreTime = new Date(score.completedAt);
      return scoreTime >= cutoffTime;
    });
  }

  // Apply limit
  return filtered.slice(0, limit);
}
