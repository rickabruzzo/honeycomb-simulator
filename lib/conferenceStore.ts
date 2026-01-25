import { kv } from "@vercel/kv";
import { Conference } from "./scenarioTypes";

const inMemoryConferences = new Map<string, Conference>();
const inMemoryIndex: string[] = [];
const MAX_INDEX_SIZE = 500;

/**
 * KV is configured when Vercel/Upstash env vars are present.
 */
function useKv(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

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
 */
export async function ensureConferencesSeeded(): Promise<void> {
  const existing = await listConferences();
  if (existing.length > 0) return; // Already seeded

  const now = new Date().toISOString();

  const seedConferences: Conference[] = [
    {
      id: "srecon-2024",
      name: "SREcon",
      themes: ["SLOs", "incident response", "reducing toil", "reliability"],
      seniorityMix: "Senior IC-heavy",
      observabilityMaturity: "High",
      createdAt: now,
      createdBy: "system",
    },
    {
      id: "aws-reinvent-2024",
      name: "AWS re:Invent",
      themes: [
        "cloud migration",
        "microservices",
        "customer experience",
        "scaling",
      ],
      seniorityMix: "Mixed leadership and ICs",
      observabilityMaturity: "Medium",
      createdAt: now,
      createdBy: "system",
    },
    {
      id: "kubecon-2024",
      name: "KubeCon",
      themes: [
        "Kubernetes",
        "cloud native",
        "containers",
        "platform engineering",
      ],
      seniorityMix: "IC-heavy with platform leads",
      observabilityMaturity: "High",
      createdAt: now,
      createdBy: "system",
    },
  ];

  for (const conf of seedConferences) {
    await upsertConference(conf);
  }

  console.log(`[ConferenceStore] Seeded ${seedConferences.length} conferences`);
}
