import { kv } from "@vercel/kv";
import { listPersonas, archivePersona } from "./personaStore";
import { listConferences, archiveConference } from "./conferenceStore";

/**
 * KV is configured when Vercel/Upstash env vars are present.
 */
function useKv(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

/**
 * Normalize name for comparison (trim, lowercase, collapse whitespace)
 */
function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Clean up duplicate personas and old scenario-labeled personas
 * Archives personas with these exact names (case-insensitive):
 * - "Director of Engineer: Migrating monolith t, Growing blind spots | Legacy apm +"
 * - "SRE: Recent outage, Alert fatigue | Prometheus +"
 * - Any persona with "(Scenario X)" suffix in the name
 */
export async function cleanupDuplicatePersonas(): Promise<number> {
  if (!useKv()) {
    console.log("[CleanupDuplicates] KV not configured, skipping cleanup");
    return 0;
  }

  const personas = await listPersonas(false); // Exclude already archived
  let archivedCount = 0;

  // List of exact duplicate names to remove
  const duplicatesToRemove = [
    "director of engineer: migrating monolith t, growing blind spots | legacy apm +",
    "sre: recent outage, alert fatigue | prometheus +",
  ];

  for (const persona of personas) {
    const normalizedName = normalizeName(persona.name);

    // Check if it's an exact duplicate match
    if (duplicatesToRemove.includes(normalizedName)) {
      await archivePersona(persona.id);
      console.log(`[CleanupDuplicates] Archived duplicate persona: ${persona.name}`);
      archivedCount++;
      continue;
    }

    // Check if it has (Scenario X) suffix
    if (persona.name.includes("(Scenario ") && persona.name.includes(")")) {
      await archivePersona(persona.id);
      console.log(`[CleanupDuplicates] Archived old scenario persona: ${persona.name}`);
      archivedCount++;
    }
  }

  if (archivedCount > 0) {
    console.log(`[CleanupDuplicates] Archived ${archivedCount} duplicate personas`);
  }

  return archivedCount;
}

/**
 * Clean up old standalone "KubeCon" conference
 * Archives any conference with the exact name "KubeCon" (standalone, not "KubeCon + CloudNativeCon")
 */
export async function cleanupOldConferences(): Promise<number> {
  if (!useKv()) {
    console.log("[CleanupDuplicates] KV not configured, skipping cleanup");
    return 0;
  }

  const conferences = await listConferences(false); // Exclude already archived
  let archivedCount = 0;

  for (const conf of conferences) {
    const normalizedName = normalizeName(conf.name);

    // Archive standalone "KubeCon" only (not "KubeCon + CloudNativeCon")
    if (normalizedName === "kubecon") {
      await archiveConference(conf.id);
      console.log(`[CleanupDuplicates] Archived old conference: ${conf.name}`);
      archivedCount++;
    }
  }

  if (archivedCount > 0) {
    console.log(`[CleanupDuplicates] Archived ${archivedCount} old conferences`);
  }

  return archivedCount;
}

/**
 * Run all cleanup tasks
 */
export async function runCleanup(): Promise<{
  personas: number;
  conferences: number;
}> {
  const personas = await cleanupDuplicatePersonas();
  const conferences = await cleanupOldConferences();

  return { personas, conferences };
}
