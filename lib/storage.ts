import { kv } from "@vercel/kv";
import type { EnrichmentResult } from "./llm/enrichmentTypes";
import type { Persona } from "./scenarioTypes";
import type { ConversationMomentum } from "./attendee/momentumModel";

import { useKv } from "./kvConfig";
import { getMemStore } from "./memoryStore";
export interface SessionState {
  id: string;
  currentState: string;
  stateHistory: Array<{ from: string; to: string; timestamp: string }>;
  transcript: Array<{
    id: string;
    type: "system" | "trainee" | "attendee";
    text: string;
    timestamp: string;
    // Momentum snapshot at the time this message was stored
    momentumScore?: number;
    momentumDelta?: number;
  }>;
  violations: string[];
  kickoff: {
    attendeeProfile: string;
    personaId?: string;
    enrichment?: EnrichmentResult;
    // Snapshot fields (Phase H1)
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
  // Full Persona object (for persona-driven response generation)
  persona?: Persona;
  // Phase 1: Momentum tracking (no behavior changes yet)
  momentum?: ConversationMomentum;
  // Detected outcome from transcript signals (state-agnostic)
  detectedOutcome?: {
    type: "BADGE_SCAN" | "DEMO" | "FLYER";
    detectedAt: string;
    detectedFrom: "attendee" | "trainee";
  };
  // Topic memory — maintains conversational continuity across turns
  currentTopic?: string;
  consecutiveNewTopicCount?: number;
  // Named tools the attendee has mentioned (e.g. ["elk","prometheus"])
  currentTools?: string[];
  // Set to true once the trainee has introduced a solution/product capability.
  // Gates evaluation questions (ask_demo, ask_docs, ask_badge) so the attendee
  // doesn't jump to CTAs before the product has been described.
  solutionIntroduced?: boolean;

  /**
   * True once the trainee has offered or performed a badge scan.
   *
   * Without this the attendee could ask "Can you scan my badge?" after the trainee had
   * already scanned it - the director's own guard only checks whether IT had previously
   * chosen ask_badge, so it had no idea the thing had already happened in the conversation.
   */
  badgeScanOffered?: boolean;

  /**
   * Prompt bundle version that generated the most recent attendee reply.
   *
   * Recorded so transcript exports can say which prompt produced a conversation. The export
   * previously hardcoded "v1.1.0", which made every session look like it ran on an old
   * bundle. That matters for SME calibration: a transcript is only evidence about the prompt
   * that actually produced it.
   */
  promptBundleVersion?: string;
  // Set to true once the trainee has framed the product with a real explanation
  // (e.g. "Honeycomb is...", "We help teams...", "It lets you...").
  // Stricter than solutionIntroduced — gates competitor/evaluation booth questions
  // so they only appear after the trainee has actually described what the product does.
  productExplained?: boolean;
}

/**
 * Sessions live on the globalThis-backed store in development, NOT a module-local Map.
 *
 * Under Turbopack dev, API routes can execute in separate module instances, so a module-local
 * Map diverges between routes: a session written by /message would be invisible to /end, which
 * 404s with "Session not found". Every other store already uses getMemStore() for this reason;
 * sessions were the last holdout. In production KV is used and this does not apply.
 */
function sessionMap(): Map<string, SessionState> {
  return getMemStore().sessions;
}

/**
 * KV is configured when Vercel/Upstash env vars are present.
 * (Locally, these appear after `vercel env pull .env.local`.)
 */

export async function saveSession(session: SessionState): Promise<void> {
  if (useKv()) {
    await kv.set(`session:${session.id}`, session);
    return;
  }
  sessionMap().set(session.id, session);
}

export async function getSession(id: string): Promise<SessionState | null> {
  if (useKv()) {
    const result = await kv.get<SessionState>(`session:${id}`);
    return result ?? null;
  }
  return sessionMap().get(id) ?? null;
}

export async function deleteSession(id: string): Promise<void> {
  if (useKv()) {
    await kv.del(`session:${id}`);
    return;
  }
  sessionMap().delete(id);
}