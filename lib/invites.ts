import { kv } from "@vercel/kv";

import { useKv } from "./kvConfig";
import { getMemStore } from "./memoryStore";
export interface InviteRecord {
  token: string;
  sessionId: string;
  createdAt: string;
  personaId?: string;
  traineeId?: string;
  traineeName?: string;
  revoked?: boolean;
  expiresAt?: string;
  createdBy?: string;
  /** Training-wheels (guided) mode: attendee attributes progressively reveal to the trainee. */
  trainingWheels?: boolean;
  // Snapshot fields for session initialization
  personaDisplayName?: string;
  traineeNameShort?: string;
}

// Dev/in-memory invites live on the globalThis-backed store (getMemStore), NOT module-local
// Maps — Turbopack can run different API routes in separate module instances, so a module-local
// Map would leave an invite created by one route invisible to the tracker/delete routes.
// store.inviteIndex here is the token -> sessionId reverse mapping (its declared purpose).

/**
 * KV is configured when Vercel/Upstash env vars are present.
 */

export async function saveInvite(invite: InviteRecord): Promise<void> {
  if (useKv()) {
    await kv.set(`invite:${invite.token}`, invite);
    await kv.set(`session_invite:${invite.sessionId}`, { token: invite.token });
    return;
  }
  const store = getMemStore();
  store.invites.set(invite.token, invite);
  store.inviteIndex.set(invite.sessionId, invite.token);
}

export async function getInvite(token: string): Promise<InviteRecord | null> {
  if (useKv()) {
    const result = await kv.get<InviteRecord>(`invite:${token}`);
    return result ?? null;
  }
  return getMemStore().invites.get(token) ?? null;
}

/**
 * Delete an invite record and its session_invite reverse-mapping. Returns the deleted
 * invite (so callers can also clean up the session/score it points at), or null if absent.
 */
export async function deleteInvite(token: string): Promise<InviteRecord | null> {
  const invite = await getInvite(token);
  if (useKv()) {
    await kv.del(`invite:${token}`);
    if (invite?.sessionId) {
      await kv.del(`session_invite:${invite.sessionId}`);
    }
    return invite;
  }
  const store = getMemStore();
  store.invites.delete(token);
  if (invite?.sessionId) {
    store.inviteIndex.delete(invite.sessionId);
  }
  return invite;
}

export async function linkSessionToInvite(sessionId: string, token: string): Promise<void> {
  if (useKv()) {
    await kv.set(`session_invite:${sessionId}`, { token });
    return;
  }
  getMemStore().inviteIndex.set(sessionId, token);
}

export async function getInviteForSession(sessionId: string): Promise<string | null> {
  if (useKv()) {
    const result = await kv.get<{ token: string }>(`session_invite:${sessionId}`);
    return result?.token ?? null;
  }
  return getMemStore().inviteIndex.get(sessionId) ?? null;
}
