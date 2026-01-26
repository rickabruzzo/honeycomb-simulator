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
 * Archives any persona that:
 * 1. Has a specific legacy ID (direng_migration_medium, sre_alert_fatigue_hard)
 * 2. Has a role prefix + colon pattern (e.g., "SRE:", "Dir Eng:", "Director of Engineer:")
 * 3. Contains " | " (pipe separator) AND is not one of the clean seeded names
 * 4. Has "(Scenario X)" suffix in the name
 * 5. Does NOT start with "scenario-" (those are the clean ones we keep)
 *
 * Clean seeded IDs to preserve (scenario-a through scenario-f)
 * Clean seeded names to preserve:
 * - Platform Engineer
 * - Site Reliability Engineer
 * - Senior Fullstack Developer
 * - Director of Engineering
 * - Technical Buyer
 * - CTO (Startup)
 */
export async function cleanupDuplicatePersonas(): Promise<number> {
  if (!useKv()) {
    console.log("[CleanupDuplicates] KV not configured, skipping cleanup");
    return 0;
  }

  const personas = await listPersonas(false); // Exclude already archived
  let archivedCount = 0;

  // Specific legacy persona IDs to remove
  const legacyIds = new Set([
    "direng_migration_medium",
    "sre_alert_fatigue_hard",
  ]);

  // Clean seeded names to preserve (normalized)
  const cleanNames = new Set([
    "platform engineer",
    "site reliability engineer",
    "senior fullstack developer",
    "director of engineering",
    "technical buyer",
    "cto (startup)",
  ]);

  for (const persona of personas) {
    // NEVER archive scenario-* personas (those are the clean seeded ones)
    if (persona.id.startsWith("scenario-")) {
      continue;
    }

    const normalizedName = normalizeName(persona.name);

    // Skip if it's a clean seeded name
    if (cleanNames.has(normalizedName)) {
      continue;
    }

    let shouldArchive = false;
    let reason = "";

    // Check if it's a specific legacy ID
    if (legacyIds.has(persona.id)) {
      shouldArchive = true;
      reason = `legacy ID (${persona.id})`;
    }

    // Check if it has (Scenario X) suffix
    if (persona.name.includes("(Scenario ") && persona.name.includes(")")) {
      shouldArchive = true;
      reason = "has (Scenario X) suffix";
    }

    // Check for role prefix + colon pattern (e.g., "SRE:", "Dir Eng:", "Director of Engineer:")
    const rolePrefixPattern = /^(sre|dir eng|director of engineer|platform eng|devops|cloud eng|engineering manager|software eng):/i;
    if (rolePrefixPattern.test(persona.name)) {
      shouldArchive = true;
      reason = "has role prefix + colon pattern";
    }

    // Check for pipe separator (legacy format) and not a clean name
    if (persona.name.includes(" | ")) {
      shouldArchive = true;
      reason = "has pipe separator (legacy format)";
    }

    if (shouldArchive) {
      await archivePersona(persona.id);
      console.log(`[CleanupDuplicates] Archived persona: ${persona.name} (${reason})`);
      archivedCount++;
    }
  }

  if (archivedCount > 0) {
    console.log(`[CleanupDuplicates] Archived ${archivedCount} duplicate personas`);
  }

  return archivedCount;
}

/**
 * Clean up old conferences
 * Archives:
 * - Standalone "KubeCon" (replaced by "KubeCon + CloudNativeCon")
 * - "QCon EMEA" (renamed to "QCon")
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
      continue;
    }

    // Archive "QCon EMEA" (renamed to "QCon")
    if (normalizedName === "qcon emea") {
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
