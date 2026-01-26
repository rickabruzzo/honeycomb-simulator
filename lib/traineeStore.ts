import { kv } from "@vercel/kv";
import { useKv } from "./kvConfig";

export interface Trainee {
  id: string;
  firstName: string;
  lastName: string;
  isArchived?: boolean;
  createdAt: string;
  updatedAt?: string;
}

const inMemoryTrainees = new Map<string, Trainee>();
const inMemoryIndex: string[] = [];
const MAX_INDEX_SIZE = 500;

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
 * List all trainees (excluding archived by default), newest first
 */
export async function listTrainees(
  includeArchived = false
): Promise<Trainee[]> {
  if (useKv()) {
    const index = (await kv.get<string[]>("trainees:index")) ?? [];
    const trainees: Trainee[] = [];

    for (const id of index) {
      const trainee = await kv.get<Trainee>(`trainee:${id}`);
      if (trainee && (includeArchived || !trainee.isArchived)) {
        trainees.push(trainee);
      }
    }

    return trainees;
  } else {
    // In-memory fallback
    const trainees: Trainee[] = [];
    for (const id of inMemoryIndex) {
      const trainee = inMemoryTrainees.get(id);
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
  return inMemoryTrainees.get(id) ?? null;
}

/**
 * Create or update a trainee
 */
export async function upsertTrainee(
  trainee: Partial<Trainee> & { firstName: string; lastName: string }
): Promise<Trainee> {
  const now = new Date().toISOString();
  const id = trainee.id || generateTraineeId(trainee.firstName, trainee.lastName);

  // Check if updating existing
  const existing = await getTrainee(id);
  const isUpdate = Boolean(existing);

  const fullTrainee: Trainee = {
    id,
    firstName: trainee.firstName,
    lastName: trainee.lastName,
    createdAt: existing?.createdAt ?? now,
    updatedAt: isUpdate ? now : undefined,
    isArchived: trainee.isArchived ?? false,
  };

  if (useKv()) {
    // Save trainee
    await kv.set(`trainee:${id}`, fullTrainee);

    // Update index if new (prepend to keep newest first)
    if (!isUpdate) {
      const index = (await kv.get<string[]>("trainees:index")) ?? [];
      const filtered = index.filter((i) => i !== id);
      const updated = [id, ...filtered].slice(0, MAX_INDEX_SIZE);
      await kv.set("trainees:index", updated);
    }
  } else {
    // In-memory fallback
    inMemoryTrainees.set(id, fullTrainee);

    if (!isUpdate) {
      const filtered = inMemoryIndex.filter((i) => i !== id);
      inMemoryIndex.length = 0;
      inMemoryIndex.push(id, ...filtered);
      if (inMemoryIndex.length > MAX_INDEX_SIZE) {
        inMemoryIndex.length = MAX_INDEX_SIZE;
      }
    }
  }

  return fullTrainee;
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
    inMemoryTrainees.set(id, archived);
  }

  return true;
}
