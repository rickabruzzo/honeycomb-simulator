import { kv } from "@vercel/kv";

export interface InviteRecord {
  token: string;
  sessionId: string;
  createdAt: string;
  conferenceId?: string; // Added for admin tracker
  personaId?: string; // Added for admin tracker
  traineeId?: string; // Trainee who will use this invite
  traineeName?: string; // Full trainee name for display
  revoked?: boolean;
  expiresAt?: string;
  createdBy?: string;
}

const inMemoryInvites = new Map<string, InviteRecord>();
const inMemorySessionInvites = new Map<string, { token: string }>();

/**
 * KV is configured when Vercel/Upstash env vars are present.
 */
function useKv(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export async function saveInvite(invite: InviteRecord): Promise<void> {
  if (useKv()) {
    await kv.set(`invite:${invite.token}`, invite);
    await kv.set(`session_invite:${invite.sessionId}`, { token: invite.token });
    return;
  }
  inMemoryInvites.set(invite.token, invite);
  inMemorySessionInvites.set(invite.sessionId, { token: invite.token });
}

export async function getInvite(token: string): Promise<InviteRecord | null> {
  if (useKv()) {
    const result = await kv.get<InviteRecord>(`invite:${token}`);
    return result ?? null;
  }
  return inMemoryInvites.get(token) ?? null;
}

export async function linkSessionToInvite(sessionId: string, token: string): Promise<void> {
  if (useKv()) {
    await kv.set(`session_invite:${sessionId}`, { token });
    return;
  }
  inMemorySessionInvites.set(sessionId, { token });
}

export async function getInviteForSession(sessionId: string): Promise<string | null> {
  if (useKv()) {
    const result = await kv.get<{ token: string }>(`session_invite:${sessionId}`);
    return result?.token ?? null;
  }
  const record = inMemorySessionInvites.get(sessionId);
  return record?.token ?? null;
}
