import { kv } from "@vercel/kv";
import { Persona } from "./scenarioTypes";
import { PERSONAS } from "./personas";
import { buildPersonaSubtitle } from "./formatUtils";

const inMemoryPersonas = new Map<string, Persona>();
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
 * Parse persona fields from attendeeProfile string
 * Safe parsing - returns defaults if parsing fails
 */
function parseAttendeeProfile(profile: string): {
  personaType: string;
  modifiers: string[];
  emotionalPosture: string;
  toolingBias: string;
  otelFamiliarity: "never" | "aware" | "considering" | "starting" | "active";
} {
  const lines = profile.split("\n");
  let personaType = "";
  let modifiers: string[] = [];
  let emotionalPosture = "";
  let toolingBias = "";
  let otelFamiliarity: "never" | "aware" | "considering" | "starting" | "active" = "never";

  for (const line of lines) {
    if (line.startsWith("Persona:")) {
      personaType = line.replace("Persona:", "").trim();
    } else if (line.startsWith("Modifiers:")) {
      const modText = line.replace("Modifiers:", "").trim();
      modifiers = modText.split(";").map((m) => m.trim()).filter(Boolean);
    } else if (line.startsWith("Emotional posture:")) {
      emotionalPosture = line.replace("Emotional posture:", "").trim();
    } else if (line.startsWith("Tooling bias:")) {
      toolingBias = line.replace("Tooling bias:", "").trim();
    } else if (line.startsWith("OpenTelemetry familiarity:")) {
      const famText = line
        .replace("OpenTelemetry familiarity:", "")
        .trim()
        .toLowerCase();
      if (famText.includes("never") || famText.includes("not heard")) {
        otelFamiliarity = "never";
      } else if (famText.includes("aware")) {
        otelFamiliarity = "aware";
      } else if (famText.includes("considering")) {
        otelFamiliarity = "considering";
      } else if (famText.includes("starting")) {
        otelFamiliarity = "starting";
      } else if (famText.includes("active")) {
        otelFamiliarity = "active";
      }
    }
  }

  return {
    personaType: personaType || "Unknown",
    modifiers,
    emotionalPosture: emotionalPosture || "Neutral",
    toolingBias: toolingBias || "Various tools",
    otelFamiliarity,
  };
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
    for (const id of inMemoryIndex) {
      const persona = inMemoryPersonas.get(id);
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
  return inMemoryPersonas.get(id) ?? null;
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
    inMemoryPersonas.set(id, fullPersona);

    if (!isUpdate) {
      const filtered = inMemoryIndex.filter((i) => i !== id);
      inMemoryIndex.length = 0;
      inMemoryIndex.push(id, ...filtered);
      if (inMemoryIndex.length > MAX_INDEX_SIZE) {
        inMemoryIndex.length = MAX_INDEX_SIZE;
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
    inMemoryPersonas.set(id, archived);
  }

  return true;
}

/**
 * Seed initial personas from existing presets
 */
export async function ensurePersonasSeeded(): Promise<void> {
  const existing = await listPersonas();
  if (existing.length > 0) return; // Already seeded

  const now = new Date().toISOString();

  for (const preset of PERSONAS) {
    try {
      // Parse attendeeProfile safely
      const parsed = parseAttendeeProfile(preset.attendeeProfile);

      // Create structured persona (DO NOT store attendeeProfile)
      const persona: Persona = {
        id: preset.id,
        name: preset.name,
        personaType: parsed.personaType,
        modifiers: parsed.modifiers,
        emotionalPosture: parsed.emotionalPosture,
        toolingBias: parsed.toolingBias,
        otelFamiliarity: parsed.otelFamiliarity,
        behaviorBrief: `${parsed.personaType} with ${parsed.emotionalPosture.toLowerCase()} posture. ${parsed.modifiers.join(", ")}`.trim(),
        createdAt: now,
        createdBy: "system",
      };

      await upsertPersona(persona);
    } catch (e) {
      console.error(`Failed to seed persona ${preset.id}:`, e);
      // Continue with minimal object if parsing fails
      await upsertPersona({
        id: preset.id,
        name: preset.name,
        personaType: "Unknown",
        modifiers: [],
        emotionalPosture: "Neutral",
        toolingBias: "Various tools",
        otelFamiliarity: "never",
        behaviorBrief: preset.name,
        createdAt: now,
        createdBy: "system",
      });
    }
  }

  console.log(`[PersonaStore] Seeded ${PERSONAS.length} personas`);
}
