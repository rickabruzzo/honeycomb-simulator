import { kv } from '@vercel/kv';

export interface SessionState {
  id: string;
  currentState: string;
  stateHistory: Array<{ from: string; to: string; timestamp: string }>;
  transcript: Array<{
    id: string;
    type: 'system' | 'trainee' | 'attendee';
    text: string;
    timestamp: string;
  }>;
  violations: string[];
  kickoff: {
    conferenceContext: string;
    attendeeProfile: string;
    difficulty: string;
  };
  startTime: string;
  active: boolean;
}

const inMemoryStorage = new Map<string, SessionState>();
const USE_KV = !!process.env.KV_REST_API_URL;

export async function saveSession(session: SessionState): Promise<void> {
  if (USE_KV) {
    await kv.set(`session:${session.id}`, session);
  } else {
    inMemoryStorage.set(session.id, session);
  }
}

export async function getSession(id: string): Promise<SessionState | null> {
  if (USE_KV) {
    return await kv.get<SessionState>(`session:${id}`);
  } else {
    return inMemoryStorage.get(id) || null;
  }
}

export async function deleteSession(id: string): Promise<void> {
  if (USE_KV) {
    await kv.del(`session:${id}`);
  } else {
    inMemoryStorage.delete(id);
  }
}