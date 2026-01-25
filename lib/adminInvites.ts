import { listInvitesFromIndex } from "./inviteIndex";
import { getInvite, InviteRecord } from "./invites";
import { getSession, SessionState } from "./storage";
import { getScore } from "./scoreStore";
import { getConference } from "./conferenceStore";
import { getPersona } from "./personaStore";
import { buildPersonaTitle } from "./formatUtils";

export type AdminInviteRow = {
  token: string;
  sessionId: string;
  conferenceId: string | null;
  conferenceName: string | null;
  personaId: string | null;
  personaDisplayName: string | null;
  jobTitle: string | null;
  difficulty: "easy" | "medium" | "hard" | null;
  createdAt: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  score: number | null;
  grade: string | null;
  lastActivityAt: string | null;
  shareUrl: string | null;
  traineeUrl: string;
  revoked?: boolean;
};

/**
 * Determine session status based on session data and score existence
 */
function determineStatus(
  session: SessionState | null,
  hasScore: boolean
): "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" {
  if (hasScore) {
    return "COMPLETED";
  }

  if (!session) {
    return "NOT_STARTED";
  }

  // Check if session has trainee messages (not just initial system/attendee)
  const hasTraineeMessages = session.transcript.some(
    (msg) => msg.type === "trainee"
  );

  if (!session.active) {
    // Session ended but no score yet
    return hasTraineeMessages ? "COMPLETED" : "NOT_STARTED";
  }

  // Active session with trainee messages
  return hasTraineeMessages ? "IN_PROGRESS" : "NOT_STARTED";
}

/**
 * Compute last activity timestamp from session transcript
 * Returns the most recent message timestamp, excluding system messages
 */
function computeLastActivity(session: SessionState | null): string | null {
  if (!session || !session.transcript.length) return null;

  // Find the most recent trainee or attendee message
  const relevantMessages = session.transcript.filter(
    (msg) => msg.type === "trainee" || msg.type === "attendee"
  );

  if (relevantMessages.length === 0) return null;

  // Return the most recent timestamp
  const lastMessage = relevantMessages[relevantMessages.length - 1];
  return lastMessage.timestamp;
}

/**
 * Fetch admin invite data for the dashboard
 */
export async function getAdminInvites(limit = 200): Promise<AdminInviteRow[]> {
  const tokens = await listInvitesFromIndex(limit);
  const rows: AdminInviteRow[] = [];

  for (const token of tokens) {
    try {
      // Load invite record
      const invite = await getInvite(token);
      if (!invite) continue;

      // Load session
      const session = await getSession(invite.sessionId);

      // Check for score
      const scoreData = await getScore(token);
      const hasScore = Boolean(scoreData);

      // Get conference data
      let conferenceId: string | null = null;
      let conferenceName: string | null = null;
      if (invite.conferenceId) {
        conferenceId = invite.conferenceId;
        const conference = await getConference(invite.conferenceId);
        conferenceName = conference?.name || null;
      }

      // Get persona data
      let personaId: string | null = null;
      let personaDisplayName: string | null = null;
      let jobTitle: string | null = null;
      if (invite.personaId) {
        personaId = invite.personaId;
        const persona = await getPersona(invite.personaId);
        if (persona) {
          personaDisplayName = buildPersonaTitle(
            persona.personaType,
            persona.modifiers,
            persona.toolingBias
          );
          jobTitle = persona.personaType;
        }
      }

      // Get difficulty (from session kickoff or persona)
      let difficulty: "easy" | "medium" | "hard" | null = null;
      if (session?.kickoff?.difficulty) {
        difficulty = session.kickoff.difficulty as "easy" | "medium" | "hard";
      }

      // Determine status
      const status = determineStatus(session, hasScore);

      // Compute last activity
      const lastActivityAt = computeLastActivity(session);

      // Build URLs
      const shareUrl = hasScore ? `/share/${token}` : null;
      const traineeUrl = `/s/${token}`;

      rows.push({
        token,
        sessionId: invite.sessionId,
        conferenceId,
        conferenceName,
        personaId,
        personaDisplayName,
        jobTitle,
        difficulty,
        createdAt: invite.createdAt,
        status,
        score: scoreData?.score ?? null,
        grade: scoreData?.grade ?? null,
        lastActivityAt,
        shareUrl,
        traineeUrl,
        revoked: invite.revoked,
      });
    } catch (error) {
      console.error(`Failed to load admin data for token ${token}:`, error);
      // Continue with other invites even if one fails
    }
  }

  return rows;
}
