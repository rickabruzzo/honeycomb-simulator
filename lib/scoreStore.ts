import { kv } from "@vercel/kv";
import { ScoreRecord } from "./scoring";

import { useKv } from "./kvConfig";
import { getMemStore } from "./memoryStore";

const MAX_SCORE_INDEX_SIZE = 5000;

// Sessions/invites/scores share the globalThis-backed store in dev so routes running in
// separate Turbopack module instances see the same data. A module-local Map here meant a
// score saved by /end was invisible to /share ("Score not found"). Production uses KV.
function scoreMap(): Map<string, ScoreRecord> {
  return getMemStore().scores as Map<string, ScoreRecord>;
}
function scoreIndex(): string[] {
  return getMemStore().scoreIndex;
}

/**
 * KV is configured when Vercel/Upstash env vars are present.
 */

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

  // In-memory fallback (globalThis-backed; shared across Turbopack module instances)
  const scores = scoreMap();
  const index = scoreIndex();
  scores.set(record.token, record);

  const filtered = index.filter((token) => token !== record.token);
  index.length = 0;
  index.push(record.token, ...filtered);
  if (index.length > MAX_SCORE_INDEX_SIZE) {
    index.length = MAX_SCORE_INDEX_SIZE;
  }
}

export async function getScore(token: string): Promise<ScoreRecord | null> {
  if (useKv()) {
    const result = await kv.get<ScoreRecord>(`score:${token}`);
    return result ?? null;
  }
  return scoreMap().get(token) ?? null;
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
    tokens = [...scoreIndex()];
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
