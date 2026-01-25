import { NextResponse } from "next/server";
import {
  listConferences,
  upsertConference,
  archiveConference,
  findConferenceByName,
} from "@/lib/conferenceStore";
import {
  listPersonas,
  upsertPersona,
} from "@/lib/personaStore";
import { toSentenceCase } from "@/lib/formatUtils";

// Helper to generate persona name
function generatePersonaName(
  jobTitle: string,
  modifiers: string[],
  toolingBias: string
): string {
  const abbreviate = (text: string): string => {
    if (!text) return "";
    const words = text.split(" ").slice(0, 3);
    const abbreviated = words.join(" ");
    return abbreviated.length > 20 ? abbreviated.substring(0, 20).trim() : abbreviated;
  };

  if (!jobTitle.trim()) return "";

  const abbrJobTitle = abbreviate(jobTitle);
  const parts: string[] = [abbrJobTitle];

  const maxModifiers = 2;
  const displayModifiers = modifiers.slice(0, maxModifiers).map(abbreviate);
  if (displayModifiers.length > 0) {
    parts.push(displayModifiers.join(", "));
  }

  if (toolingBias.trim()) {
    if (parts.length > 1) {
      return `${parts[0]}: ${parts[1]} | ${abbreviate(toolingBias)}`;
    } else {
      return `${parts[0]} | ${abbreviate(toolingBias)}`;
    }
  }

  if (parts.length > 1) {
    return `${parts[0]}: ${parts[1]}`;
  }

  return parts[0];
}

export async function POST() {
  try {
    const results = {
      conferencesUpdated: 0,
      personasUpdated: 0,
      sreconRestored: false,
      errors: [] as string[],
    };

    // 1. Restore SREcon if needed
    const conferences = await listConferences(false);
    const srecon = conferences.find(
      (c) => c.name.toLowerCase() === "srecon"
    );

    if (srecon) {
      // Check if it needs restoration
      const needsRestore =
        !srecon.themes.includes("SLOs") ||
        srecon.seniorityMix !== "Senior IC-heavy" ||
        srecon.observabilityMaturity !== "High";

      if (needsRestore) {
        // Archive the incorrect version
        await archiveConference(srecon.id);

        // Create restored version
        await upsertConference({
          name: "SREcon",
          themes: ["SLOs", "incident response", "reducing toil"],
          seniorityMix: "Senior IC-heavy",
          observabilityMaturity: "High",
          createdBy: "system",
        });

        results.sreconRestored = true;
      }
    }

    // 2. Apply sentence case to all conferences
    const allConferences = await listConferences(false);
    for (const conf of allConferences) {
      const updated = {
        ...conf,
        themes: conf.themes.map(toSentenceCase),
      };

      await upsertConference(updated);
      results.conferencesUpdated++;
    }

    // 3. Migrate all personas to new naming schema
    const allPersonas = await listPersonas(false);
    for (const persona of allPersonas) {
      const newName = generatePersonaName(
        persona.personaType,
        persona.modifiers,
        persona.toolingBias
      );

      const updated = {
        ...persona,
        name: newName,
        modifiers: persona.modifiers.map(toSentenceCase),
        emotionalPosture: toSentenceCase(persona.emotionalPosture),
        toolingBias: toSentenceCase(persona.toolingBias),
      };

      await upsertPersona(updated);
      results.personasUpdated++;
    }

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error("Migration failed:", error);
    return NextResponse.json(
      { error: "Migration failed", details: String(error) },
      { status: 500 }
    );
  }
}
