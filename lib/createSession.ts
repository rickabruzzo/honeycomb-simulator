import { randomUUID } from "crypto";
import { SessionState } from "./storage";
import { getPersonaById } from "./personas";

export interface CreateSessionInput {
  personaId?: string;
  conferenceContext?: string;
  attendeeProfile?: string;
  difficulty?: "easy" | "medium" | "hard";
}

export interface CreateSessionResult {
  session: SessionState;
  error?: string;
}

/**
 * Shared helper to create a new session from either:
 * - personaId (loads preset)
 * - manual kickoff (conferenceContext + attendeeProfile + difficulty)
 */
export function createSession(input: CreateSessionInput): CreateSessionResult {
  let conferenceContext: string | undefined = input.conferenceContext;
  let attendeeProfile: string | undefined = input.attendeeProfile;
  let difficulty: "easy" | "medium" | "hard" | undefined = input.difficulty;
  let personaId: string | undefined = input.personaId;

  // Load from persona preset if personaId provided
  if (personaId) {
    const preset = getPersonaById(personaId);
    if (!preset) {
      return {
        session: null as any,
        error: `Unknown personaId: ${personaId}`,
      };
    }

    conferenceContext = preset.conferenceContext;
    attendeeProfile = preset.attendeeProfile;
    difficulty = preset.difficulty;
  }

  // Validate required fields
  if (!conferenceContext?.trim() || !attendeeProfile?.trim() || !difficulty) {
    return {
      session: null as any,
      error:
        "Missing required fields. Provide personaId OR conferenceContext + attendeeProfile + difficulty.",
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
    },
    startTime: now,
    active: true,
  };

  return { session };
}
