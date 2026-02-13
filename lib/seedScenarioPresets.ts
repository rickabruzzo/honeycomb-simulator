/**
 * Seed canonical personas for the discovery conversation simulator.
 *
 * This file seeds the 6 canonical personas extracted from "Persona Research by PMM.pdf".
 * These personas replace the old Scenarios A-F personas.
 *
 * IMPORTANT: Hard validation guards enforce canonical persona completeness.
 * Only TDM (Technical Decision-Maker) is a buyer persona (isBuyer: true).
 */

import { findPersonaByName, upsertPersona } from "./personaStore";
import { Persona } from "./scenarioTypes";
import {
  ALL_CANONICAL_PERSONAS,
  SRE_PERSONA,
  DEVOPS_PERSONA,
  TDM_PERSONA,
  BUILD_RELEASE_PERSONA,
  DEVELOPER_PERSONA,
  PLATFORM_PERSONA,
} from "./personas/canonicalPersonas";

/**
 * Validate canonical persona completeness
 *
 * Throws an error if persona is missing required fields or has invalid configuration.
 */
function validateCanonicalPersona(persona: Persona): void {
  const personaId = persona.id;

  // 1. Only TDM is buyer
  const isTDM =
    persona.personaType.toLowerCase().includes("decision") ||
    persona.personaType.toLowerCase().includes("tdm");

  if (isTDM && !persona.isBuyer) {
    throw new Error(
      `Canonical persona validation failed: TDM persona "${personaId}" must have isBuyer=true`
    );
  }

  if (!isTDM && persona.isBuyer) {
    throw new Error(
      `Canonical persona validation failed: Non-TDM persona "${personaId}" must have isBuyer=false or undefined`
    );
  }

  // 2. All canonical personas must have complete data
  if (!persona.painAnchors || persona.painAnchors.length === 0) {
    throw new Error(
      `Canonical persona validation failed: Persona "${personaId}" missing painAnchors`
    );
  }

  if (!persona.questionBank || persona.questionBank.length === 0) {
    throw new Error(
      `Canonical persona validation failed: Persona "${personaId}" missing questionBank`
    );
  }

  if (!persona.toolStackOptions || persona.toolStackOptions.length === 0) {
    throw new Error(
      `Canonical persona validation failed: Persona "${personaId}" missing toolStackOptions`
    );
  }

  // 3. Validate pain anchor structure
  persona.painAnchors.forEach((pain, index) => {
    if (!pain.id) {
      throw new Error(
        `Canonical persona validation failed: Persona "${personaId}" painAnchors[${index}] missing id`
      );
    }
    if (!pain.pain) {
      throw new Error(
        `Canonical persona validation failed: Persona "${personaId}" painAnchors[${index}] missing pain text`
      );
    }
    if (!pain.testPhrases || pain.testPhrases.length === 0) {
      throw new Error(
        `Canonical persona validation failed: Persona "${personaId}" painAnchors[${index}] missing testPhrases`
      );
    }
    if (!pain.priority || !["primary", "secondary"].includes(pain.priority)) {
      throw new Error(
        `Canonical persona validation failed: Persona "${personaId}" painAnchors[${index}] missing or invalid priority (must be "primary" or "secondary")`
      );
    }
    if (!pain.keywords || pain.keywords.length === 0) {
      throw new Error(
        `Canonical persona validation failed: Persona "${personaId}" painAnchors[${index}] missing keywords`
      );
    }
  });

  // 4. Validate question bank structure
  persona.questionBank.forEach((q, index) => {
    if (!q.question) {
      throw new Error(
        `Canonical persona validation failed: Persona "${personaId}" questionBank[${index}] missing question text`
      );
    }
    if (
      !q.category ||
      !["discovery", "technical", "evaluation", "objection"].includes(q.category)
    ) {
      throw new Error(
        `Canonical persona validation failed: Persona "${personaId}" questionBank[${index}] missing or invalid category`
      );
    }
  });

  // 5. Validate tool stack options structure
  persona.toolStackOptions.forEach((tool, index) => {
    if (!tool.variant) {
      throw new Error(
        `Canonical persona validation failed: Persona "${personaId}" toolStackOptions[${index}] missing variant`
      );
    }
    if (!tool.tools || tool.tools.length === 0) {
      throw new Error(
        `Canonical persona validation failed: Persona "${personaId}" toolStackOptions[${index}] missing tools array`
      );
    }
  });
}

/**
 * Seed canonical personas for Scenarios.
 *
 * Idempotent: Only creates personas that don't already exist by normalized name.
 */
export async function seedScenarioPresets(): Promise<void> {
  // Validate all canonical personas before seeding
  console.log("[SeedScenarioPresets] Validating canonical personas...");

  for (const persona of ALL_CANONICAL_PERSONAS) {
    try {
      validateCanonicalPersona(persona);
    } catch (error) {
      console.error(`[SeedScenarioPresets] Validation failed:`, error);
      throw error; // Fail fast - do not seed if validation fails
    }
  }

  console.log(
    `[SeedScenarioPresets] All ${ALL_CANONICAL_PERSONAS.length} canonical personas passed validation`
  );

  // Seed personas
  let seededCount = 0;

  for (const personaData of ALL_CANONICAL_PERSONAS) {
    // Check if persona exists by normalized name
    const existing = await findPersonaByName(personaData.name);

    if (existing) {
      // Already exists - update it to ensure it has latest canonical data
      console.log(
        `[SeedScenarioPresets] Updating existing persona: ${personaData.name}`
      );
      await upsertPersona({
        ...personaData,
        id: existing.id, // Preserve existing ID
        createdAt: existing.createdAt, // Preserve creation timestamp
        updatedAt: new Date().toISOString(), // Mark as updated
      });
      seededCount++;
      continue;
    }

    // Create new persona (upsertPersona will handle displaySubtitle)
    await upsertPersona(personaData);
    seededCount++;
  }

  if (seededCount > 0) {
    console.log(
      `[SeedScenarioPresets] Seeded/updated ${seededCount} canonical personas`
    );
  }

  // Log buyer persona for verification
  const buyerPersona = ALL_CANONICAL_PERSONAS.find((p) => p.isBuyer);
  if (buyerPersona) {
    console.log(
      `[SeedScenarioPresets] Buyer persona: ${buyerPersona.name} (isBuyer=true)`
    );
  }
}
