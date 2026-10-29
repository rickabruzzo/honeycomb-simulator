import { kv } from "@vercel/kv";
import { useKv } from "./kvConfig";
import { kvIndexAdd, kvIndexList, type KvIndex } from "./kvIndex";
import { getMemStore } from "./memoryStore";

export interface Trainee {
  id: string;
  firstName: string;
  lastName: string;
  /** Lowercased. Admin-only (Builder, Quiz Results); never shown on trainee-facing pages. */
  email?: string;
  /**
   * When they first spoke in a simulator session. Training wheels default ON until this is set
   * (their first run), OFF afterwards.
   */
  firstPracticeAt?: string;
  isArchived?: boolean;
  createdAt: string;
  updatedAt?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trim + lowercase an email; null when it doesn't look like one. */
export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return EMAIL_RE.test(email) ? email : null;
}

const MAX_INDEX_SIZE = 500;

/**
 * KV: trainee ids as a sorted set scored by creation time, newest first (see lib/kvIndex.ts —
 * the old JSON array at `trainees:index` lost entries when a room of people hit /start at once;
 * it is migrated on first read).
 */
const TRAINEE_INDEX: KvIndex = {
  key: "trainees:index:v2",
  legacyKey: "trainees:index",
  cap: MAX_INDEX_SIZE,
};

// Seed-once guard to prevent repeated seeding
let seedingPromise: Promise<void> | null = null;

// Helper to get in-memory store (now uses global shared store)
function getInMemoryStore() {
  const mem = getMemStore();
  return {
    trainees: mem.trainees,
    index: mem.traineeIndex,
  };
}

/**
 * Generate a readable ID from name with random suffix
 */
function generateTraineeId(firstName: string, lastName: string): string {
  const slug = `${firstName}-${lastName}`
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .substring(0, 30);
  const suffix = Math.random().toString(36).substring(2, 6);
  return `${slug}-${suffix}`;
}

/**
 * Normalize a trainee ID by stripping random suffixes.
 * "rick-abruzzo-5zzj" -> "rick-abruzzo"
 * If traineeName is provided and inputId doesn't normalize well, slugify the name.
 */
export function normalizeTraineeId(inputId: string, traineeName?: string): string {
  // Strip trailing random suffix: 3-6 lowercase alphanumeric chars after last hyphen
  const stripped = inputId.replace(/-[a-z0-9]{3,6}$/, "");
  if (stripped && stripped !== inputId) {
    return stripped;
  }
  // If no suffix was stripped but we have a name, slugify it
  if (traineeName) {
    return slugifyName(traineeName);
  }
  return inputId;
}

/**
 * Case/whitespace-insensitive full-name key, used to dedupe trainees by name.
 * "  Rick   Abruzzo " -> "rick abruzzo"
 */
export function normalizedName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Active trainee with this name (case/whitespace-insensitive), or null. */
export async function findTraineeByName(
  firstName: string,
  lastName: string
): Promise<Trainee | null> {
  const target = normalizedName(firstName, lastName);
  const active = await listTrainees(false);
  return active.find((t) => normalizedName(t.firstName, t.lastName) === target) ?? null;
}

/** Active trainee with this email (case-insensitive), or null. */
export async function findTraineeByEmail(email: string): Promise<Trainee | null> {
  const target = email.trim().toLowerCase();
  if (!target) return null;
  const active = await listTrainees(false);
  return active.find((t) => t.email === target) ?? null;
}

/**
 * Slugify a full name: "Rick Abruzzo" -> "rick-abruzzo"
 */
export function slugifyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 30);
}

/**
 * Resolve a trainee by trying:
 * 1. Exact match on traineeId
 * 2. Match existing trainees whose ID starts with normalized base
 * 3. Auto-register from traineeName if provided
 * Returns null only if traineeId is unknown AND traineeName is missing.
 */
export async function resolveTrainee(
  traineeId: string,
  traineeName?: string
): Promise<Trainee | null> {
  // 1. Exact match
  const exact = await getTrainee(traineeId);
  if (exact) return exact;

  // 2. Try normalized ID match against all trainees
  const normalizedId = normalizeTraineeId(traineeId, traineeName);
  const allTrainees = await listTrainees(false);
  const fuzzy = allTrainees.find(
    (t) => t.id === normalizedId || t.id.startsWith(normalizedId + "-")
  );
  if (fuzzy) return fuzzy;

  // 3. If we have a name, try slugified name match
  if (traineeName) {
    const slug = slugifyName(traineeName);
    if (slug !== normalizedId) {
      const bySlug = allTrainees.find(
        (t) => t.id === slug || t.id.startsWith(slug + "-")
      );
      if (bySlug) return bySlug;
    }

    // 4. Auto-register: parse name and create trainee with canonical slug ID
    const parts = traineeName.trim().split(/\s+/);
    const firstName = parts[0] || traineeName;
    const lastName = parts.slice(1).join(" ") || "";
    return upsertTrainee({ id: slug, firstName, lastName });
  }

  return null;
}

/**
 * Format trainee name as "First L."
 */
export function formatTraineeShort(trainee: Trainee): string {
  const lastInitial = trainee.lastName.charAt(0).toUpperCase();
  return `${trainee.firstName} ${lastInitial}.`;
}

/**
 * Format trainee name as "First Last"
 */
export function formatTraineeFull(trainee: Trainee): string {
  return `${trainee.firstName} ${trainee.lastName}`;
}

/**
 * Ensure trainees are seeded (once per process)
 */
export async function ensureTraineesSeeded(): Promise<void> {
  if (!seedingPromise) {
    seedingPromise = seedTraineesInternal();
  }
  return seedingPromise;
}

/**
 * Internal seeding function (called once via ensureTraineesSeeded)
 */
async function seedTraineesInternal(): Promise<void> {
  // Seed demo trainees in development only
  const isDev = process.env.NODE_ENV === "development";

  if (!isDev) {
    console.log("[TraineeStore] Seeding complete (production - no demo trainees)");
    return;
  }

  // Check if demo trainees already exist
  const existing = await listTrainees(false);
  if (existing.length > 0) {
    console.log("[TraineeStore] Demo trainees already exist, skipping seed");
    return;
  }

  // Seed two demo trainees for development
  const demoTrainees = [
    { firstName: "Rick", lastName: "Abruzzo" },
    { firstName: "Maggie", lastName: "Ennis" },
  ];

  for (const trainee of demoTrainees) {
    await upsertTrainee(trainee);
  }

  console.log("[TraineeStore] Seeded 2 demo trainees for development");
}

/**
 * List all trainees (excluding archived by default), newest first
 */
export async function listTrainees(
  includeArchived = false
): Promise<Trainee[]> {
  if (useKv()) {
    const index = await kvIndexList(TRAINEE_INDEX);
    if (index.length === 0) return [];

    // Single MGET instead of one Upstash round-trip per trainee (N+1 → 2 calls).
    const fetched = await kv.mget<(Trainee | null)[]>(
      ...index.map((id) => `trainee:${id}`)
    );
    const trainees: Trainee[] = [];
    for (const trainee of fetched) {
      if (trainee && (includeArchived || !trainee.isArchived)) {
        trainees.push(trainee);
      }
    }

    return trainees;
  } else {
    // In-memory fallback
    const trainees: Trainee[] = [];
    for (const id of getInMemoryStore().index) {
      const trainee = getInMemoryStore().trainees.get(id);
      if (trainee && (includeArchived || !trainee.isArchived)) {
        trainees.push(trainee);
      }
    }
    return trainees;
  }
}

/**
 * Get a single trainee by ID
 */
export async function getTrainee(id: string): Promise<Trainee | null> {
  if (useKv()) {
    return (await kv.get<Trainee>(`trainee:${id}`)) ?? null;
  }
  return getInMemoryStore().trainees.get(id) ?? null;
}

/**
 * Create or update a trainee
 */
export async function upsertTrainee(
  trainee: Partial<Trainee> & { firstName: string; lastName: string }
): Promise<Trainee> {
  const now = new Date().toISOString();

  // Resolve the id. When the caller gives no explicit id, DEDUPE BY NAME: reuse an existing,
  // non-archived trainee with the same name instead of minting a new random-suffixed id.
  // generateTraineeId appends a random suffix, so without this every by-name call (e.g. the
  // grade-transcript flow) created a duplicate "Rick Abruzzo".
  let id = trainee.id;
  if (!id) {
    const target = normalizedName(trainee.firstName, trainee.lastName);
    const active = await listTrainees(false);
    const match = active.find(
      (t) => normalizedName(t.firstName, t.lastName) === target
    );
    id = match?.id ?? generateTraineeId(trainee.firstName, trainee.lastName);
  }

  // Check if updating existing
  const existing = await getTrainee(id);
  const isUpdate = Boolean(existing);

  // A caller that doesn't mention email (e.g. the by-name grading flow) must not wipe a stored one.
  const email =
    trainee.email !== undefined
      ? normalizeEmail(trainee.email) ?? undefined
      : existing?.email;

  const firstPracticeAt = trainee.firstPracticeAt ?? existing?.firstPracticeAt;
  const fullTrainee: Trainee = {
    id,
    firstName: trainee.firstName,
    lastName: trainee.lastName,
    ...(email ? { email } : {}),
    ...(firstPracticeAt ? { firstPracticeAt } : {}),
    createdAt: existing?.createdAt ?? now,
    updatedAt: isUpdate ? now : undefined,
    isArchived: trainee.isArchived ?? false,
  };

  if (useKv()) {
    // Save trainee
    await kv.set(`trainee:${id}`, fullTrainee);

    // Update index if new (newest first). One atomic ZADD + trim, so two trainees created at
    // the same moment can't overwrite each other's entry.
    if (!isUpdate) {
      await kvIndexAdd(TRAINEE_INDEX, id);
    }
  } else {
    // In-memory fallback
    getInMemoryStore().trainees.set(id, fullTrainee);

    if (!isUpdate) {
      const { index } = getInMemoryStore();
      const filtered = index.filter((i) => i !== id);
      index.length = 0;
      index.push(id, ...filtered);
      if (index.length > MAX_INDEX_SIZE) {
        index.length = MAX_INDEX_SIZE;
      }
    }
  }

  return fullTrainee;
}

/**
 * Record a trainee's first simulator turn (once). Later calls leave the original date alone, so
 * "has this person practiced before?" stays true from their first real run onward.
 */
export async function markTraineePracticed(id: string): Promise<void> {
  const existing = await getTrainee(id);
  if (!existing || existing.firstPracticeAt) return;
  await upsertTrainee({ ...existing, firstPracticeAt: new Date().toISOString() });
}

/**
 * Soft delete a trainee (set isArchived = true)
 */
export async function archiveTrainee(id: string): Promise<boolean> {
  const existing = await getTrainee(id);
  if (!existing) return false;

  const archived: Trainee = {
    ...existing,
    isArchived: true,
    updatedAt: new Date().toISOString(),
  };

  if (useKv()) {
    await kv.set(`trainee:${id}`, archived);
  } else {
    getInMemoryStore().trainees.set(id, archived);
  }

  return true;
}
