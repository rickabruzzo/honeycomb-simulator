import { kv } from "@vercel/kv";
import type { EnrichmentResult } from "./llm/enrichmentTypes";

export interface SessionState {
  id: string;
  currentState: string;
  stateHistory: Array<{ from: string; to: string; timestamp: string }>;
  transcript: Array<{
    id: string;
    type: "system" | "trainee" | "attendee";
    text: string;
    timestamp: string;
  }>;
  violations: string[];
  kickoff: {
    conferenceContext: string;
    attendeeProfile: string;
    difficulty: string;
    personaId?: string;
    enrichment?: EnrichmentResult;
    // Snapshot fields (Phase H1)
    conferenceId?: string;
    conferenceName?: string;
    personaDisplayName?: string;
    traineeId?: string;
    traineeNameShort?: string;
  };
  startTime: string;
  active: boolean;
  trainerFeedback?: {
    guidance: string;
    applyToScenario?: boolean;
    updatedAt: string;
    updatedBy?: string;
  };
  // Pending outcome for completion CTA
  pendingOutcome?: string;
  pendingEndAction?: {
    actionType: string;
    actionLabel: string;
  };
  // Deterministic seed for outcome sampling (persona-aware variance)
  outcomeSeed?: string;
  // Decision trace for outcome transparency (debugging/export)
  decisionTrace?: {
    personaBandKey?: string;
    personaWeightsUsed?: boolean;
    eligibleOutcomes?: string[];
    sampledOutcome?: string;
    demoEligibilityScore?: number;
    jitteredWeights?: Record<string, number>;
    reason?: string;
  };
  // Tooling context established during conversation
  toolingContext?: {
    apm?: string;
    logs?: string;
    metrics?: string;
    stack?: string; // Full description
  };
  // Intent exhaustion tracking (prevent repetitive responses)
  expressedIntents?: string[];
}

const inMemoryStorage = new Map<string, SessionState>();

/**
 * KV is configured when Vercel/Upstash env vars are present.
 * (Locally, these appear after `vercel env pull .env.local`.)
 */
function useKv(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export async function saveSession(session: SessionState): Promise<void> {
  if (useKv()) {
    await kv.set(`session:${session.id}`, session);
    return;
  }
  inMemoryStorage.set(session.id, session);
}

export async function getSession(id: string): Promise<SessionState | null> {
  if (useKv()) {
    const result = await kv.get<SessionState>(`session:${id}`);
    return result ?? null;
  }
  return inMemoryStorage.get(id) ?? null;
}

export async function deleteSession(id: string): Promise<void> {
  if (useKv()) {
    await kv.del(`session:${id}`);
    return;
  }
  inMemoryStorage.delete(id);
}