import { kv } from "@vercel/kv";

import { useKv } from "./kvConfig";
import { getMemStore } from "./memoryStore";
const INVITE_INDEX_KEY = "invites:index";
const MAX_INDEX_SIZE = 500;

// In-memory fallback lives on the globalThis-backed store (getMemStore().inviteOrder), NOT a
// module-local array — otherwise a Turbopack route running in a separate module instance would
// keep its own empty copy and the tracker would show nothing / delete would 404 in dev.

/**
 * KV is configured when Vercel/Upstash env vars are present.
 */

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

    // Keep only the most recent MAX_INDEX_SIZE to avoid unbounded growth. The self-serve link
    // creates a session per visitor, so 100 filled within days; the tracker still lists the
    // newest 50 by default.
    const trimmed = updated.slice(0, MAX_INDEX_SIZE);

    await kv.set(INVITE_INDEX_KEY, trimmed);
    return;
  }

  // In-memory fallback (shared store)
  const store = getMemStore();
  store.inviteOrder = [entry, ...store.inviteOrder].slice(0, MAX_INDEX_SIZE);
}

/**
 * Remove an invite token from the index. Returns true if it was present.
 */
export async function removeInviteFromIndex(token: string): Promise<boolean> {
  if (useKv()) {
    const existing =
      (await kv.get<Array<{ token: string; createdAt: string }>>(
        INVITE_INDEX_KEY
      )) || [];
    const filtered = existing.filter((entry) => entry.token !== token);
    if (filtered.length === existing.length) return false;
    await kv.set(INVITE_INDEX_KEY, filtered);
    return true;
  }

  const store = getMemStore();
  const before = store.inviteOrder.length;
  store.inviteOrder = store.inviteOrder.filter((entry) => entry.token !== token);
  return store.inviteOrder.length !== before;
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

  // In-memory fallback (shared store)
  return getMemStore().inviteOrder.slice(0, limit).map((entry) => entry.token);
}
