import { kv } from "@vercel/kv";
import { ScoreRecord } from "./scoring";

const inMemoryScores = new Map<string, ScoreRecord>();

/**
 * KV is configured when Vercel/Upstash env vars are present.
 */
function useKv(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export async function saveScore(record: ScoreRecord): Promise<void> {
  if (useKv()) {
    await kv.set(`score:${record.token}`, record);
    return;
  }
  inMemoryScores.set(record.token, record);
}

export async function getScore(token: string): Promise<ScoreRecord | null> {
  if (useKv()) {
    const result = await kv.get<ScoreRecord>(`score:${token}`);
    return result ?? null;
  }
  return inMemoryScores.get(token) ?? null;
}
