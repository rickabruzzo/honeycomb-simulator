/**
 * Atomic "newest first" KV indexes.
 *
 * The three listing indexes (tracker invites, trainees, quiz results) used to be one JSON array
 * per index, updated read → modify → kv.set. Two requests landing together (a room of people on
 * /start) could each read the same array, and the second write erased the first's entry: the
 * invite never showed on the Tracker, the trainee vanished from the picker and re-added under a
 * new id (orphaning their quiz pass). Each index is now a Redis sorted set — member = token/id,
 * score = when it was added (ms) — so ZRANGE … REV lists newest first, and every add is a single
 * MULTI/EXEC (ZADD + trim to the cap), so concurrent writers can't lose each other's entries.
 *
 * Migration is lazy. A read (or remove) that finds the legacy array seeds the sorted set from it
 * with ZADD NX, so entries already in the set keep their scores and re-seeding is a no-op; legacy
 * entries get data-derived scores (the invite's createdAt, else their rank from the oldest end,
 * which is below any real timestamp), so what readers get back — the array's order — is
 * unchanged. Adds don't check the legacy key: one round trip, no read.
 *
 * Only the PRODUCTION deployment deletes the legacy array (in the same transaction). Preview
 * deployments and FORCE_VERCEL_KV dev servers share the production KV while production may still
 * run the old code that reads the array; they re-seed from it on every read instead, which keeps
 * both sides complete until the new code is live in production and the first read there drops it.
 *
 * KV only. The in-memory dev store keeps its arrays: single process, no race.
 */
import { kv } from "@vercel/kv";

export type KvIndex = {
  /** Sorted-set key. */
  key: string;
  /** The pre-migration JSON-array key (newest first); seeded into `key`, deleted in production. */
  legacyKey: string;
  /** Most entries kept; the oldest are trimmed on every add. */
  cap: number;
  /**
   * Member (and score, when the entry carries a timestamp) for one legacy-array entry; null skips
   * it. Default: the entry itself when it is a string.
   */
  legacyEntry?: (entry: unknown) => { member: string; score?: number } | null;
};

/** Add `member` (newest). `score` defaults to now; `ifAbsent` keeps an existing member's place. */
export async function kvIndexAdd(
  index: KvIndex,
  member: string,
  opts: { score?: number; ifAbsent?: boolean } = {}
): Promise<void> {
  const score = Number.isFinite(opts.score) ? (opts.score as number) : Date.now();
  const tx = kv.multi();
  if (opts.ifAbsent) tx.zadd(index.key, { nx: true }, { score, member });
  else tx.zadd(index.key, { score, member });
  tx.zremrangebyrank(index.key, 0, -(index.cap + 1));
  await tx.exec();
}

/** Remove `member`. True when it was present (in the sorted set or a not-yet-migrated array). */
export async function kvIndexRemove(index: KvIndex, member: string): Promise<boolean> {
  const legacy = await kv.get<unknown>(index.legacyKey);
  if (legacy !== null && legacy !== undefined) await migrateLegacy(index, legacy);
  return (await kv.zrem(index.key, member)) > 0;
}

/** Members, newest first, at most `limit` (all when omitted). Migrates the legacy array. */
export async function kvIndexList(index: KvIndex, limit?: number): Promise<string[]> {
  if (limit !== undefined && limit <= 0) return [];
  const stop = limit === undefined ? -1 : limit - 1;
  const [legacy, members] = (await kv
    .pipeline()
    .get<unknown>(index.legacyKey)
    .zrange<unknown[]>(index.key, 0, stop, { rev: true })
    .exec()) as [unknown, unknown[]];
  if (legacy === null || legacy === undefined) return members.map(String);
  await migrateLegacy(index, legacy);
  return (await kv.zrange<unknown[]>(index.key, 0, stop, { rev: true })).map(String);
}

/** Delete the index (both keys). */
export async function kvIndexClear(index: KvIndex): Promise<void> {
  await kv.del(index.key, index.legacyKey);
}

/** The production deployment is the only reader allowed to drop the legacy array (see header). */
const canDeleteLegacy = () => process.env.VERCEL_ENV === "production";

const defaultLegacyEntry = (entry: unknown) =>
  typeof entry === "string" ? { member: entry } : null;

const warnedMalformed = new Set<string>();

async function migrateLegacy(index: KvIndex, legacy: unknown): Promise<void> {
  if (!Array.isArray(legacy) && !warnedMalformed.has(index.legacyKey)) {
    warnedMalformed.add(index.legacyKey);
    console.warn(`[kvIndex] ${index.legacyKey} is not an array; nothing to migrate`);
  }
  const toEntry = index.legacyEntry ?? defaultLegacyEntry;
  const seen = new Set<string>();
  const entries: Array<{ member: string; score?: number }> = [];
  for (const raw of Array.isArray(legacy) ? legacy : []) {
    const entry = toEntry(raw);
    if (entry && entry.member && !seen.has(entry.member)) {
      seen.add(entry.member);
      entries.push(entry);
    }
  }

  // The array is newest first. An entry without a timestamp scores its rank from the oldest end
  // (0 = oldest): that keeps the array's order, sits below any real timestamp, and is stable when
  // the array grows at the front between two seedings.
  const n = entries.length;
  const pairs = entries.map(({ member, score }, i) => ({
    member,
    score: Number.isFinite(score) ? (score as number) : n - 1 - i,
  }));

  const tx = kv.multi();
  if (pairs.length) {
    const [first, ...rest] = pairs;
    tx.zadd(index.key, { nx: true }, first, ...rest);
    tx.zremrangebyrank(index.key, 0, -(index.cap + 1));
  }
  if (canDeleteLegacy()) tx.del(index.legacyKey);
  if (tx.length() === 0) return;
  await tx.exec();
}
