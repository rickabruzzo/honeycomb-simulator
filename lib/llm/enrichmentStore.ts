import { kv } from "@vercel/kv";
import type { EnrichmentResult } from "./enrichmentTypes";
import { getMemStore } from "../memoryStore";

/**
 * KV is configured when Vercel/Upstash env vars are present.
 */
function useKv(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

/**
 * Helper to get in-memory store (now uses global shared store)
 */
function getInMemoryStore() {
  return getMemStore().enrichments;
}

/**
 * Build cache key for enrichment
 */
function buildKey(conferenceId: string, personaId: string): string {
  return `enrichment:${conferenceId}:${personaId}`;
}

/**
 * Get cached enrichment result
 */
export async function getEnrichment(
  conferenceId: string,
  personaId: string
): Promise<EnrichmentResult | null> {
  const key = buildKey(conferenceId, personaId);

  if (useKv()) {
    return (await kv.get<EnrichmentResult>(key)) ?? null;
  }

  return getInMemoryStore().get(key) ?? null;
}

/**
 * Save enrichment result to cache
 */
export async function saveEnrichment(
  result: EnrichmentResult
): Promise<void> {
  const key = buildKey(result.conferenceId, result.personaId);

  if (useKv()) {
    await kv.set(key, result);
  } else {
    getInMemoryStore().set(key, result);
  }
}

/**
 * Invalidate cached enrichment
 */
export async function invalidateEnrichment(
  conferenceId: string,
  personaId: string
): Promise<void> {
  const key = buildKey(conferenceId, personaId);

  if (useKv()) {
    await kv.del(key);
  } else {
    getInMemoryStore().delete(key);
  }
}
