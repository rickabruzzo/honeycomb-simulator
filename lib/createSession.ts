import { randomUUID } from "crypto";
import { SessionState } from "./storage";
import { getPersonaById, PERSONAS } from "./personas";
import { getEnrichment, saveEnrichment } from "./llm/enrichmentStore";
import { getEnrichmentProvider } from "./llm/provider";
import type { EnrichmentInput } from "./llm/enrichmentTypes";
import { getConference, ensureConferencesSeeded } from "./conferenceStore";
import { getPersona, ensurePersonasSeeded, listPersonas } from "./personaStore";
import { buildPersonaTitle } from "./formatUtils";
import { getTrainee, formatTraineeShort, ensureTraineesSeeded } from "./traineeStore";

/**
 * Generate dynamic opening line based on emotional posture and modifiers.
 *
 * @param attendeeProfile - Persona profile string
 * @returns Opening action line
 */
function generateOpeningLine(attendeeProfile: string): string {
  const lower = attendeeProfile.toLowerCase();

  // Parse emotional posture
  let emotionalPosture = "neutral";
  const postureMatch = lower.match(/emotional posture:\s*([^\n]+)/);
  if (postureMatch) {
    emotionalPosture = postureMatch[1].trim();
  }

  // Parse modifiers
  let modifiers = "";
  const modifiersMatch = lower.match(/modifiers:\s*([^\n]+)/);
  if (modifiersMatch) {
    modifiers = modifiersMatch[1].trim();
  }

  // Map emotional posture + modifiers to opening lines
  // Guarded
  if (emotionalPosture.includes("guard") || emotionalPosture.includes("blunt")) {
    if (modifiers.includes("outage") || modifiers.includes("firefighting")) {
      return "*walks up, looks tense—like they've been firefighting*";
    }
    return "*walks up, glances at badge, keeps it brief*";
  }

  // Rushed / time-constrained
  if (emotionalPosture.includes("rush") || emotionalPosture.includes("hurr") || modifiers.includes("time-constrained")) {
    return "*approaches quickly, checking phone, clearly in a hurry*";
  }

  // Burned out / exhausted
  if (emotionalPosture.includes("burn") || emotionalPosture.includes("exhaust") || emotionalPosture.includes("tired")) {
    return "*sighs, half-smiles, looks tired*";
  }

  // Curious / engaged
  if (emotionalPosture.includes("curious") || emotionalPosture.includes("eager") || emotionalPosture.includes("engaged")) {
    return "*leans in, scanning the booth display*";
  }

  // Skeptical
  if (emotionalPosture.includes("skeptic") || emotionalPosture.includes("critical")) {
    return "*approaches with arms crossed, evaluating*";
  }

  // Thoughtful / analytical
  if (emotionalPosture.includes("thought") || emotionalPosture.includes("analyt") || emotionalPosture.includes("consider")) {
    return "*pauses at the booth, thoughtful expression*";
  }

  // Friendly / open
  if (emotionalPosture.includes("friend") || emotionalPosture.includes("open") || emotionalPosture.includes("warm")) {
    return "*walks up with a friendly nod*";
  }

  // Frustrated / stressed
  if (emotionalPosture.includes("frustrat") || emotionalPosture.includes("stress") || modifiers.includes("alert fatigue")) {
    return "*approaches looking visibly frustrated*";
  }

  // Cost-focused / budget-conscious
  if (modifiers.includes("cost") || modifiers.includes("budget") || modifiers.includes("procurement")) {
    return "*stops by, clearly evaluating options*";
  }

  // Migration / change context
  if (modifiers.includes("migrat") || modifiers.includes("transition") || modifiers.includes("growing")) {
    return "*approaches with a curious but cautious look*";
  }

  // Default fallback
  return "*approaches booth casually*";
}

export interface CreateSessionInput {
  personaId?: string;
  conferenceId?: string;
  conferenceContext?: string;
  attendeeProfile?: string;
  difficulty?: "easy" | "medium" | "hard";
  // Snapshot fields (Phase H1)
  conferenceName?: string;
  personaDisplayName?: string;
  traineeId?: string;
  traineeNameShort?: string;
  // Performance: skip enrichment generation (check cache only)
  skipEnrichmentGeneration?: boolean;
}

export interface CreateSessionResult {
  session: SessionState;
  error?: string;
}

/**
 * Shared helper to create a new session from kickoff data
 * Note: attendeeProfile is required; conferenceContext and difficulty are optional
 * (persona lookup should be done by the caller if needed)
 */
export function createSession(input: CreateSessionInput): CreateSessionResult {
  const conferenceContext = input.conferenceContext;
  const attendeeProfile = input.attendeeProfile;
  const difficulty = input.difficulty;
  const personaId = input.personaId;

  // Validate required fields
  if (!attendeeProfile?.trim()) {
    return {
      session: null as any,
      error:
        "Missing required field: attendeeProfile is required.",
    };
  }

  const sessionId = randomUUID();
  const now = new Date().toISOString();

  // Generate dynamic opening line based on emotional posture
  const openingLine = generateOpeningLine(attendeeProfile);

  // Generate deterministic outcome seed for persona-aware variance
  const outcomeSeed = `${sessionId}:${input.personaId || 'unknown'}:${input.conferenceId || 'none'}`;

  // Use "conference booth" as generic context if no conference provided
  const contextForDisplay = conferenceContext || "conference booth";

  const session: SessionState = {
    id: sessionId,
    currentState: "ICEBREAKER",
    stateHistory: [],
    transcript: [
      {
        id: randomUUID(),
        type: "system",
        text: `Session started at ${contextForDisplay}. Current state: ICEBREAKER`,
        timestamp: now,
      },
      {
        id: randomUUID(),
        type: "attendee",
        text: openingLine,
        timestamp: now,
      },
    ],
    violations: [],
    kickoff: {
      conferenceContext: conferenceContext || undefined,
      attendeeProfile,
      difficulty: difficulty || undefined,
      personaId,
      // Snapshot fields (Phase H1)
      conferenceId: input.conferenceId || undefined,
      conferenceName: input.conferenceName || undefined,
      personaDisplayName: input.personaDisplayName,
      traineeId: input.traineeId,
      traineeNameShort: input.traineeNameShort,
    },
    startTime: now,
    active: true,
    outcomeSeed,
  };

  return { session };
}

/**
 * Async wrapper that includes enrichment generation if conferenceId and personaId are available
 * Phase H1: Also resolves display names for snapshot if not already provided
 */
export async function createSessionWithEnrichment(
  input: CreateSessionInput
): Promise<CreateSessionResult> {
  // Ensure all stores are seeded (critical for in-memory dev mode with Turbopack)
  await Promise.all([
    ensurePersonasSeeded(),
    ensureTraineesSeeded(),
  ]);

  // Resolve kickoff data and display names
  let conferenceContext = input.conferenceContext;
  let attendeeProfile = input.attendeeProfile;
  let difficulty = input.difficulty;
  let conferenceName = input.conferenceName;
  let personaDisplayName = input.personaDisplayName;
  let traineeNameShort = input.traineeNameShort;

  try {
    // Resolve conference data (optional - persona-first mode doesn't require this)
    let conference = null;
    if (input.conferenceId) {
      await ensureConferencesSeeded();
      conference = await getConference(input.conferenceId);
      if (conference) {
        if (!conferenceName) {
          conferenceName = conference.name;
        }
        if (!conferenceContext) {
          // Build conferenceContext from conference metadata
          conferenceContext = `Conference: ${conference.name}
Themes: ${conference.themes.join(", ")}
Seniority Mix: ${conference.seniorityMix}
Observability Maturity: ${conference.observabilityMaturity}`;
        }
      }
    }

    // If personaId provided, load preset data from persona store
    if (input.personaId) {
      const persona = await getPersona(input.personaId);
      if (!persona) {
        // Defensive: log available persona IDs for debugging
        const available = await listPersonas(false);
        const availableIds = available.map((p) => p.id);
        console.error(
          `[createSession] Persona not found: ${input.personaId}. Available IDs:`,
          availableIds
        );
        return {
          session: null as any,
          error: `Unknown personaId: ${input.personaId}. Available personas: ${availableIds.join(", ")}`,
        };
      }

      // Build attendeeProfile from persona metadata
      if (!attendeeProfile) {
        attendeeProfile = `Persona: ${persona.personaType}
Modifiers: ${persona.modifiers.join("; ")}
Emotional posture: ${persona.emotionalPosture}
Tooling bias: ${persona.toolingBias}
OpenTelemetry familiarity: ${persona.otelFamiliarity}`;
      }

      // Set default difficulty if not provided (based on persona familiarity)
      if (!difficulty) {
        // Map familiarity to difficulty
        if (persona.otelFamiliarity === "never") difficulty = "easy";
        else if (persona.otelFamiliarity === "aware" || persona.otelFamiliarity === "considering") difficulty = "medium";
        else difficulty = "hard";
      }

      // Build display name
      if (!personaDisplayName) {
        personaDisplayName = buildPersonaTitle(
          persona.personaType,
          persona.modifiers,
          persona.toolingBias
        );
      }
    }

    // Resolve trainee name
    if (input.traineeId && !traineeNameShort) {
      const trainee = await getTrainee(input.traineeId);
      if (trainee) {
        traineeNameShort = formatTraineeShort(trainee);
      }
    }
  } catch (error) {
    console.error("Failed to resolve kickoff data:", error);
    return {
      session: null as any,
      error: `Failed to resolve kickoff data: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }

  // Create the base session with resolved data
  const result = createSession({
    ...input,
    conferenceContext,
    attendeeProfile,
    difficulty,
    conferenceName,
    personaDisplayName,
    traineeNameShort,
  });

  if (result.error) {
    return result;
  }

  // Try to add enrichment if we have the IDs
  if (input.conferenceId && input.personaId) {
    try {
      // Check cache first
      let enrichment = await getEnrichment(input.conferenceId, input.personaId);

      // Only generate if not cached AND not skipping generation
      if (!enrichment && !input.skipEnrichmentGeneration && input.conferenceContext && input.attendeeProfile) {
        const provider = getEnrichmentProvider();
        const enrichmentInput: EnrichmentInput = {
          conferenceId: input.conferenceId,
          personaId: input.personaId,
          conferenceContext: input.conferenceContext,
          attendeeProfile: input.attendeeProfile,
        };

        enrichment = await provider.enrich(enrichmentInput);
        await saveEnrichment(enrichment);
      }

      // Add enrichment to session (may be null if skipping)
      if (enrichment) {
        result.session.kickoff.enrichment = enrichment;
      }
    } catch (error) {
      // Log error but don't fail session creation
      console.error("Failed to load enrichment:", error);
    }
  }

  return result;
}
