import { kv } from "@vercel/kv";
import { Conference } from "./scenarioTypes";
import { useKv } from "./kvConfig";

const inMemoryConferences = new Map<string, Conference>();
const inMemoryIndex: string[] = [];
const MAX_INDEX_SIZE = 500;

// Seed-once guard to prevent repeated seeding
let seedingPromise: Promise<void> | null = null;

/**
 * Generate a readable slug-based ID with random suffix
 */
function generateConferenceId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .substring(0, 30);
  const suffix = Math.random().toString(36).substring(2, 6);
  return `${slug}-${suffix}`;
}

/**
 * List all conferences (excluding archived by default)
 */
export async function listConferences(
  includeArchived = false
): Promise<Conference[]> {
  if (useKv()) {
    const index = (await kv.get<string[]>("conferences:index")) ?? [];
    const conferences: Conference[] = [];

    for (const id of index) {
      const conf = await kv.get<Conference>(`conference:${id}`);
      if (conf && (includeArchived || !conf.isArchived)) {
        conferences.push(conf);
      }
    }

    return conferences;
  } else {
    // In-memory fallback
    const conferences: Conference[] = [];
    for (const id of inMemoryIndex) {
      const conf = inMemoryConferences.get(id);
      if (conf && (includeArchived || !conf.isArchived)) {
        conferences.push(conf);
      }
    }
    return conferences;
  }
}

/**
 * Get a single conference by ID
 */
export async function getConference(id: string): Promise<Conference | null> {
  if (useKv()) {
    return (await kv.get<Conference>(`conference:${id}`)) ?? null;
  }
  return inMemoryConferences.get(id) ?? null;
}

/**
 * Normalize name for duplicate detection (trim, lowercase, collapse whitespace)
 */
function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Find a conference by normalized name (excluding archived)
 */
export async function findConferenceByName(
  name: string
): Promise<Conference | null> {
  const normalizedName = normalizeName(name);
  const conferences = await listConferences(false); // Exclude archived

  return (
    conferences.find(
      (conf) => normalizeName(conf.name) === normalizedName
    ) ?? null
  );
}

/**
 * Create or update a conference
 */
export async function upsertConference(
  conference: Partial<Conference> & { name: string }
): Promise<Conference> {
  const now = new Date().toISOString();
  const id = conference.id || generateConferenceId(conference.name);

  // Check if updating existing
  const existing = await getConference(id);
  const isUpdate = Boolean(existing);

  const fullConference: Conference = {
    id,
    name: conference.name,
    themes: conference.themes ?? [],
    seniorityMix: conference.seniorityMix ?? "",
    observabilityMaturity: conference.observabilityMaturity ?? "Medium",
    sources: conference.sources,
    createdAt: existing?.createdAt ?? now,
    createdBy: conference.createdBy ?? "admin",
    updatedAt: isUpdate ? now : undefined,
    isArchived: conference.isArchived ?? false,
  };

  if (useKv()) {
    // Save conference
    await kv.set(`conference:${id}`, fullConference);

    // Update index if new
    if (!isUpdate) {
      const index = (await kv.get<string[]>("conferences:index")) ?? [];
      const filtered = index.filter((i) => i !== id);
      const updated = [id, ...filtered].slice(0, MAX_INDEX_SIZE);
      await kv.set("conferences:index", updated);
    }
  } else {
    // In-memory fallback
    inMemoryConferences.set(id, fullConference);

    if (!isUpdate) {
      const filtered = inMemoryIndex.filter((i) => i !== id);
      inMemoryIndex.length = 0;
      inMemoryIndex.push(id, ...filtered);
      if (inMemoryIndex.length > MAX_INDEX_SIZE) {
        inMemoryIndex.length = MAX_INDEX_SIZE;
      }
    }
  }

  return fullConference;
}

/**
 * Soft delete a conference (set isArchived = true)
 */
export async function archiveConference(id: string): Promise<boolean> {
  const existing = await getConference(id);
  if (!existing) return false;

  const archived: Conference = {
    ...existing,
    isArchived: true,
    updatedAt: new Date().toISOString(),
  };

  if (useKv()) {
    await kv.set(`conference:${id}`, archived);
  } else {
    inMemoryConferences.set(id, archived);
  }

  return true;
}

/**
 * Seed initial conferences from common conference contexts
 * Idempotent: Only creates conferences that don't already exist by normalized name
 * Seed-once: Ensures seeding only happens once per process
 */
async function seedConferencesInternal(): Promise<void> {
  const now = new Date().toISOString();

  const seedConferences: Conference[] = [
    {
      id: "srecon-2024",
      name: "SREcon",
      themes: ["SLOs", "Incident response", "Reducing toil"],
      seniorityMix: "Senior IC-heavy",
      observabilityMaturity: "High",
      createdAt: now,
      createdBy: "system",
    },
    {
      id: "aws-reinvent-2024",
      name: "AWS re:Invent",
      themes: [
        "Cloud migration",
        "Microservices",
        "Customer experience",
        "Scaling architecture",
      ],
      seniorityMix: "Director / VP-heavy",
      observabilityMaturity: "Medium",
      createdAt: now,
      createdBy: "system",
    },
    {
      id: "kubecon-cloudnativecon-2024",
      name: "KubeCon + CloudNativeCon",
      themes: ["OpenTelemetry", "Developer experience", "Debugging"],
      seniorityMix: "Senior IC-heavy",
      observabilityMaturity: "High",
      createdAt: now,
      createdBy: "system",
    },
    {
      id: "qcon-2024",
      name: "QCon",
      themes: ["Distributed systems", "Engineering leadership", "Scaling startups"],
      seniorityMix: "CTO / founders",
      observabilityMaturity: "Low",
      createdAt: now,
      createdBy: "system",
    },
  ];

  let seededCount = 0;
  for (const conf of seedConferences) {
    // Check if conference exists by normalized name
    const existing = await findConferenceByName(conf.name);
    if (existing) {
      // Already exists, skip
      continue;
    }

    // Create new conference
    await upsertConference(conf);
    seededCount++;
  }

  if (seededCount > 0) {
    console.log(`[ConferenceStore] Seeded ${seededCount} conferences`);
  }
}

/**
 * Public API - ensures seeding happens exactly once per process
 */
export async function ensureConferencesSeeded(): Promise<void> {
  if (!seedingPromise) {
    seedingPromise = seedConferencesInternal();
  }
  return seedingPromise;
}
