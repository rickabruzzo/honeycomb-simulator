import { kv } from "@vercel/kv";
import { Persona } from "./scenarioTypes";
import { buildPersonaSubtitle } from "./formatUtils";
import { useKv } from "./kvConfig";
import { seedScenarioPresets } from "./seedScenarioPresets";
import { getMemStore } from "./memoryStore";
import { CANONICAL_PERSONA_IDS } from "./personas/canonicalPersonas";

const MAX_INDEX_SIZE = 500;

// Helper to get in-memory store (now uses global shared store)
function getInMemoryStore() {
  const mem = getMemStore();
  return {
    personas: mem.personas,
    index: mem.personaIndex,
  };
}

// Seed-once guard to prevent repeated seeding
let seedingPromise: Promise<void> | null = null;

/**
 * Generate a readable slug-based ID with random suffix
 */
function generatePersonaId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .substring(0, 30);
  const suffix = Math.random().toString(36).substring(2, 6);
  return `${slug}-${suffix}`;
}

/**
 * List all personas (excluding archived by default)
 *
 * HARD FILTER: Only canonical persona IDs are returned.
 * Deprecated personas are excluded even if stored.
 */
export async function listPersonas(
  includeArchived = false
): Promise<Persona[]> {
  if (useKv()) {
    const index = (await kv.get<string[]>("personas:index")) ?? [];
    // ALLOWLIST FILTER: Only canonical personas.
    const ids = index.filter((id) => CANONICAL_PERSONA_IDS.has(id));
    if (ids.length === 0) return [];

    // Batch the reads into a single MGET instead of one round-trip per persona.
    // The old N+1 loop was the dominant cost of /api/bootstrap on cold starts
    // (each `kv.get` is a separate Upstash HTTP call, ~65ms each).
    const fetched = await kv.mget<(Persona | null)[]>(
      ...ids.map((id) => `persona:${id}`)
    );
    const personas: Persona[] = [];
    for (const persona of fetched) {
      if (persona && (includeArchived || !persona.isArchived)) {
        personas.push(persona);
      }
    }

    return personas;
  } else {
    // In-memory fallback
    const personas: Persona[] = [];
    for (const id of getInMemoryStore().index) {
      // ALLOWLIST FILTER: Only canonical personas
      if (!CANONICAL_PERSONA_IDS.has(id)) {
        continue;
      }

      const persona = getInMemoryStore().personas.get(id);
      if (persona && (includeArchived || !persona.isArchived)) {
        personas.push(persona);
      }
    }
    return personas;
  }
}

/**
 * Get a single persona by ID
 *
 * HARD FILTER: Only canonical persona IDs are returned.
 */
export async function getPersona(id: string): Promise<Persona | null> {
  // ALLOWLIST FILTER: Only canonical personas
  if (!CANONICAL_PERSONA_IDS.has(id)) {
    return null;
  }

  if (useKv()) {
    return (await kv.get<Persona>(`persona:${id}`)) ?? null;
  }
  return getInMemoryStore().personas.get(id) ?? null;
}

/**
 * Normalize name for duplicate detection (trim, lowercase, collapse whitespace)
 */
function normalizePersonaName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Find a persona by normalized name (excluding archived)
 */
export async function findPersonaByName(
  name: string
): Promise<Persona | null> {
  const normalizedName = normalizePersonaName(name);
  const personas = await listPersonas(false); // Exclude archived

  return (
    personas.find(
      (persona) => normalizePersonaName(persona.name) === normalizedName
    ) ?? null
  );
}

/**
 * Create or update a persona
 */
export async function upsertPersona(
  persona: Partial<Persona> & { name: string }
): Promise<Persona> {
  const now = new Date().toISOString();
  const id = persona.id || generatePersonaId(persona.name);

  // Check if updating existing
  const existing = await getPersona(id);
  const isUpdate = Boolean(existing);

  // Generate behaviorBrief if missing
  let behaviorBrief = persona.behaviorBrief;
  if (!behaviorBrief) {
    const parts: string[] = [];
    if (persona.personaType) parts.push(persona.personaType);
    if (persona.modifiers && persona.modifiers.length > 0) {
      parts.push(persona.modifiers.join(", "));
    }
    if (persona.emotionalPosture) parts.push(persona.emotionalPosture);
    behaviorBrief = parts.join(" — ") || "No brief provided";
  }

  // Generate displaySubtitle for editor UI
  const displaySubtitle = buildPersonaSubtitle(
    persona.personaType ?? "Unknown",
    persona.modifiers ?? [],
    persona.toolingBias ?? "Various tools",
    persona.emotionalPosture ?? "Neutral",
    persona.otelFamiliarity ?? "never"
  );

  // Merge existing → incoming so behaviour-driving fields the caller doesn't
  // resend (painAnchors, isBuyer, questionBank, objectionBank, toolStackOptions)
  // survive a partial update, then normalize the base fields on top. A fixed
  // whitelist here previously dropped those fields entirely — the stored persona
  // lost its pain inventory, which silently disabled the attendee prompt's
  // painPoints injection and the training-wheels pain reveal.
  const fullPersona: Persona = {
    ...(existing ?? {}),
    ...persona,
    id,
    name: persona.name,
    personaType: persona.personaType ?? existing?.personaType ?? "Unknown",
    modifiers: persona.modifiers ?? existing?.modifiers ?? [],
    emotionalPosture: persona.emotionalPosture ?? existing?.emotionalPosture ?? "Neutral",
    toolingBias: persona.toolingBias ?? existing?.toolingBias ?? "Various tools",
    otelFamiliarity: persona.otelFamiliarity ?? existing?.otelFamiliarity ?? "never",
    sources: persona.sources ?? existing?.sources,
    behaviorBrief,
    displaySubtitle,
    createdAt: existing?.createdAt ?? now,
    createdBy: persona.createdBy ?? existing?.createdBy ?? "admin",
    updatedAt: isUpdate ? now : undefined,
    isArchived: persona.isArchived ?? existing?.isArchived ?? false,
  };

  if (useKv()) {
    // Save persona
    await kv.set(`persona:${id}`, fullPersona);

    // Update index if new
    if (!isUpdate) {
      const index = (await kv.get<string[]>("personas:index")) ?? [];
      const filtered = index.filter((i) => i !== id);
      const updated = [id, ...filtered].slice(0, MAX_INDEX_SIZE);
      await kv.set("personas:index", updated);
    }
  } else {
    // In-memory fallback
    getInMemoryStore().personas.set(id, fullPersona);

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

  return fullPersona;
}

/**
 * Soft delete a persona (set isArchived = true)
 */
export async function archivePersona(id: string): Promise<boolean> {
  const existing = await getPersona(id);
  if (!existing) return false;

  const archived: Persona = {
    ...existing,
    isArchived: true,
    updatedAt: new Date().toISOString(),
  };

  if (useKv()) {
    await kv.set(`persona:${id}`, archived);
  } else {
    getInMemoryStore().personas.set(id, archived);
  }

  return true;
}

/**
 * Seed-version guard (KV only). seedScenarioPresets used to re-upsert all canonical
 * personas on every cold start (~60 sequential Upstash round-trips ≈ 5s on /api/bootstrap).
 * We now stamp a version derived from the canonical persona set; when it already matches,
 * seeding is skipped entirely. In in-memory dev mode there's no cross-process state, so we
 * return null and let ensurePersonasSeeded's once-per-process promise gate the (instant) seed.
 */
export async function getPersonaSeedVersion(): Promise<string | null> {
  if (!useKv()) return null;
  return (await kv.get<string>("personas:seed_version")) ?? null;
}

export async function setPersonaSeedVersion(version: string): Promise<void> {
  if (!useKv()) return;
  await kv.set("personas:seed_version", version);
}

/**
 * Internal seeding logic - now delegates to seedScenarioPresets
 */
async function seedPersonasInternal(): Promise<void> {
  // Delegate to the idempotent scenario presets seeding
  await seedScenarioPresets();
  console.log("[PersonaStore] Persona seeding complete");
}

/**
 * Public API - ensures seeding happens exactly once per process
 */
export async function ensurePersonasSeeded(): Promise<void> {
  if (!seedingPromise) {
    seedingPromise = seedPersonasInternal();
  }
  return seedingPromise;
}
