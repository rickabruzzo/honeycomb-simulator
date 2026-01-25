import { listInvitesFromIndex } from "./inviteIndex";
import { getInvite, InviteRecord } from "./invites";
import { getSession, SessionState } from "./storage";
import { getScore } from "./scoreStore";
import { getPersonaById } from "./personas";

export type AdminInviteRow = {
  token: string;
  sessionId: string;
  personaId?: string;
  personaName: string;
  difficulty?: string;
  createdAt: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  scoreTokenExists: boolean;
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
 * Fetch admin invite data for the dashboard
 */
export async function getAdminInvites(limit = 50): Promise<AdminInviteRow[]> {
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
      const score = await getScore(token);
      const hasScore = Boolean(score);

      // Determine persona name
      let personaName = "Custom";
      let difficulty = session?.kickoff?.difficulty;

      if (session?.kickoff?.personaId) {
        const persona = getPersonaById(session.kickoff.personaId);
        if (persona) {
          personaName = persona.name;
          difficulty = persona.difficulty;
        }
      }

      // Determine status
      const status = determineStatus(session, hasScore);

      rows.push({
        token,
        sessionId: invite.sessionId,
        personaId: session?.kickoff?.personaId,
        personaName,
        difficulty,
        createdAt: invite.createdAt,
        status,
        scoreTokenExists: hasScore,
        revoked: invite.revoked,
      });
    } catch (error) {
      console.error(`Failed to load admin data for token ${token}:`, error);
      // Continue with other invites even if one fails
    }
  }

  return rows;
}
