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
}

export interface CreateSessionResult {
  session: SessionState;
  error?: string;
}

/**
 * Shared helper to create a new session from kickoff data
 * Note: conferenceContext, attendeeProfile, and difficulty must be provided
 * (persona lookup should be done by the caller if needed)
 */
export function createSession(input: CreateSessionInput): CreateSessionResult {
  const conferenceContext = input.conferenceContext;
  const attendeeProfile = input.attendeeProfile;
  const difficulty = input.difficulty;
  const personaId = input.personaId;

  // Validate required fields
  if (!conferenceContext?.trim() || !attendeeProfile?.trim() || !difficulty) {
    return {
      session: null as any,
      error:
        "Missing required fields: conferenceContext, attendeeProfile, and difficulty are required.",
    };
  }

  const sessionId = randomUUID();
  const now = new Date().toISOString();

  const session: SessionState = {
    id: sessionId,
    currentState: "ICEBREAKER",
    stateHistory: [],
    transcript: [
      {
        id: randomUUID(),
        type: "system",
        text: `Session started at ${conferenceContext}. Current state: ICEBREAKER`,
        timestamp: now,
      },
      {
        id: randomUUID(),
        type: "attendee",
        text: "*approaches booth casually*",
        timestamp: now,
      },
    ],
    violations: [],
    kickoff: {
      conferenceContext,
      attendeeProfile,
      difficulty,
      personaId,
      // Snapshot fields (Phase H1)
      conferenceId: input.conferenceId,
      conferenceName: input.conferenceName,
      personaDisplayName: input.personaDisplayName,
      traineeId: input.traineeId,
      traineeNameShort: input.traineeNameShort,
    },
    startTime: now,
    active: true,
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
    ensureConferencesSeeded(),
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
    // Resolve conference data
    let conference = null;
    if (input.conferenceId) {
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

      // Generate if not cached
      if (!enrichment && input.conferenceContext && input.attendeeProfile) {
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

      // Add enrichment to session
      if (enrichment) {
        result.session.kickoff.enrichment = enrichment;
      }
    } catch (error) {
      // Log error but don't fail session creation
      console.error("Failed to generate enrichment:", error);
    }
  }

  return result;
}
