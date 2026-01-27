import { kv } from "@vercel/kv";
import { Persona } from "./scenarioTypes";
import { buildPersonaSubtitle } from "./formatUtils";
import { useKv } from "./kvConfig";
import { seedScenarioPresets } from "./seedScenarioPresets";
import { getMemStore } from "./memoryStore";

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
 */
export async function listPersonas(
  includeArchived = false
): Promise<Persona[]> {
  if (useKv()) {
    const index = (await kv.get<string[]>("personas:index")) ?? [];
    const personas: Persona[] = [];

    for (const id of index) {
      const persona = await kv.get<Persona>(`persona:${id}`);
      if (persona && (includeArchived || !persona.isArchived)) {
        personas.push(persona);
      }
    }

    return personas;
  } else {
    // In-memory fallback
    const personas: Persona[] = [];
    for (const id of getInMemoryStore().index) {
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
 */
export async function getPersona(id: string): Promise<Persona | null> {
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

  const fullPersona: Persona = {
    id,
    name: persona.name,
    personaType: persona.personaType ?? "Unknown",
    modifiers: persona.modifiers ?? [],
    emotionalPosture: persona.emotionalPosture ?? "Neutral",
    toolingBias: persona.toolingBias ?? "Various tools",
    otelFamiliarity: persona.otelFamiliarity ?? "never",
    sources: persona.sources,
    behaviorBrief,
    displaySubtitle,
    createdAt: existing?.createdAt ?? now,
    createdBy: persona.createdBy ?? "admin",
    updatedAt: isUpdate ? now : undefined,
    isArchived: persona.isArchived ?? false,
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
