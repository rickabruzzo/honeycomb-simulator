import { kv } from "@vercel/kv";

const INVITE_INDEX_KEY = "invites:index";

// In-memory fallback for local development
let inMemoryIndex: Array<{ token: string; createdAt: string }> = [];

/**
 * KV is configured when Vercel/Upstash env vars are present.
 */
function useKv(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

/**
 * Add an invite token to the index for admin listing
 */
export async function addInviteToIndex(
  token: string,
  createdAtISO: string
): Promise<void> {
  const entry = { token, createdAt: createdAtISO };

  if (useKv()) {
    // Get existing index
    const existing =
      (await kv.get<Array<{ token: string; createdAt: string }>>(
        INVITE_INDEX_KEY
      )) || [];

    // Prepend new entry (newest first)
    const updated = [entry, ...existing];

    // Keep only most recent 100 to avoid unbounded growth
    const trimmed = updated.slice(0, 100);

    await kv.set(INVITE_INDEX_KEY, trimmed);
    return;
  }

  // In-memory fallback
  inMemoryIndex = [entry, ...inMemoryIndex].slice(0, 100);
}

/**
 * List invite tokens from the index (newest first)
 */
export async function listInvitesFromIndex(limit = 50): Promise<string[]> {
  if (useKv()) {
    const index =
      (await kv.get<Array<{ token: string; createdAt: string }>>(
        INVITE_INDEX_KEY
      )) || [];
    return index.slice(0, limit).map((entry) => entry.token);
  }

  // In-memory fallback
  return inMemoryIndex.slice(0, limit).map((entry) => entry.token);
}
