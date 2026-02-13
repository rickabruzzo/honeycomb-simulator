/**
 * OpenTelemetry Terminology Helpers
 *
 * Enforces OTel familiarity realism:
 * - never/aware → "OpenTelemetry" (no shorthand)
 * - considering/starting → "OpenTelemetry (OTel)" (introduce shorthand)
 * - active → "OTel" (use shorthand freely)
 */

import type { Persona } from "../scenarioTypes";

/**
 * Render OTel term based on persona familiarity level
 */
export function renderOTelTerm(persona: Persona): string {
  const familiarity = persona.otelFamiliarity;

  switch (familiarity) {
    case "never":
    case "aware":
      return "OpenTelemetry";

    case "considering":
    case "starting":
      return "OpenTelemetry (OTel)";

    case "active":
      return "OTel";

    default:
      return "OpenTelemetry";
  }
}

/**
 * Post-filter to ensure OTel shorthand matches familiarity level
 *
 * If persona has never/aware familiarity and output contains "OTel",
 * replace with "OpenTelemetry".
 */
export function enforceOTelTerminology(
  text: string,
  persona: Persona
): string {
  const familiarity = persona.otelFamiliarity;

  // If persona is never/aware, replace any "OTel" with "OpenTelemetry"
  if (familiarity === "never" || familiarity === "aware") {
    // Match "OTel" as a standalone word (not part of another word)
    return text.replace(/\bOTel\b/g, "OpenTelemetry");
  }

  return text;
}
