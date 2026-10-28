import { useKv } from "./kvConfig";
import { kvIndexAdd, kvIndexClear, kvIndexList, kvIndexRemove, type KvIndex } from "./kvIndex";
import { getMemStore } from "./memoryStore";

// In-memory fallback lives on the globalThis-backed store (getMemStore().inviteOrder), NOT a
// module-local array — otherwise a Turbopack route running in a separate module instance would
// keep its own empty copy and the tracker would show nothing / delete would 404 in dev.

const MAX_INDEX_SIZE = 100;

/**
 * KV: a sorted set of tokens scored by createdAt (see lib/kvIndex.ts for why — concurrent
 * /start users were overwriting each other's entries in the old JSON array). The old array at
 * `invites:index` held `{ token, createdAt }` entries and is migrated on first read.
 */
const INVITE_INDEX: KvIndex = {
  key: "invites:index:v2",
  legacyKey: "invites:index",
  cap: MAX_INDEX_SIZE,
  legacyEntry: (entry) => {
    const { token, createdAt } = (entry ?? {}) as { token?: unknown; createdAt?: unknown };
    if (typeof token !== "string") return null;
    const score = typeof createdAt === "string" ? Date.parse(createdAt) : Number.NaN;
    return Number.isFinite(score) ? { member: token, score } : { member: token };
  },
};

/**
 * Add an invite token to the index for admin listing
 */
export async function addInviteToIndex(
  token: string,
  createdAtISO: string
): Promise<void> {
  const entry = { token, createdAt: createdAtISO };

  if (useKv()) {
    await kvIndexAdd(INVITE_INDEX, token, { score: Date.parse(createdAtISO) });
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
    return kvIndexRemove(INVITE_INDEX, token);
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
    return kvIndexList(INVITE_INDEX, limit);
  }

  // In-memory fallback (shared store)
  return getMemStore().inviteOrder.slice(0, limit).map((entry) => entry.token);
}

/**
 * Empty the index (admin reset / wipe scripts). Deletes the sorted set and any legacy array.
 */
export async function clearInviteIndex(): Promise<void> {
  if (useKv()) {
    await kvIndexClear(INVITE_INDEX);
    return;
  }
  getMemStore().inviteOrder = [];
}
