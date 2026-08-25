/**
 * Global Shared Memory Store for Development
 *
 * Problem: Next.js with Turbopack can execute different API routes in separate
 * module instances, causing module-local Maps to diverge. This leads to
 * inconsistent data between routes (e.g., trainee created in Editor doesn't
 * appear in Builder).
 *
 * Solution: Use globalThis to share a single memory store across all modules
 * in the same Node process. All routes read/write from the same Maps.
 */

import type { Conference, Persona } from "./scenarioTypes";
import type { Trainee } from "./traineeStore";
import type { SessionState } from "./storage";
import type { InviteRecord } from "./invites";
import type { EnrichmentResult } from "./llm/enrichmentTypes";
import type { PromptBundle } from "./llm/promptBundleTypes";

/**
 * Global memory store structure
 */
export interface GlobalMemoryStore {
  conferences: Map<string, Conference>;
  conferenceIndex: string[];
  personas: Map<string, Persona>;
  personaIndex: string[];
  trainees: Map<string, Trainee>;
  traineeIndex: string[];
  sessions: Map<string, SessionState>;
  invites: Map<string, InviteRecord>; // token -> InviteRecord
  inviteIndex: Map<string, string>; // sessionId -> token (reverse lookup for getInviteForSession)
  inviteOrder: Array<{ token: string; createdAt: string }>; // newest-first tracker listing
  enrichments: Map<string, EnrichmentResult>;
  scores: Map<string, unknown>;   // token -> ScoreRecord (typed at the scoreStore boundary)
  scoreIndex: string[];           // tokens, newest first
  meta: {
    bootstrapCache?: any;
    bootstrapCacheAt?: number;
    promptBundles?: Map<string, PromptBundle>;
    promptBundleIndex?: string[];
    activeBundleId?: string;
  };
}

/**
 * Extend globalThis to include our memory store
 */
declare global {
  var __HC_SIM_MEM__: GlobalMemoryStore | undefined;
}

/**
 * Get or initialize the global shared memory store
 * Safe to call multiple times - returns same instance
 */
export function getMemStore(): GlobalMemoryStore {
  if (!globalThis.__HC_SIM_MEM__) {
    console.log("[MemoryStore] Initializing global shared memory store");
    globalThis.__HC_SIM_MEM__ = {
      conferences: new Map(),
      conferenceIndex: [],
      personas: new Map(),
      personaIndex: [],
      trainees: new Map(),
      traineeIndex: [],
      sessions: new Map(),
      invites: new Map(),
      inviteIndex: new Map(),
      inviteOrder: [],
      enrichments: new Map(),
      scores: new Map(),
      scoreIndex: [],
      meta: {},
    };
  }

  // Backfill any field added after the store was first created. Without this, adding a new
  // field to the store and hot-reloading leaves the already-initialized globalThis object
  // missing that field, so accessors throw on undefined until a full server restart. Each
  // guard is a no-op once the field exists.
  const store = globalThis.__HC_SIM_MEM__ as Partial<GlobalMemoryStore>;
  store.conferences ??= new Map();
  store.conferenceIndex ??= [];
  store.personas ??= new Map();
  store.personaIndex ??= [];
  store.trainees ??= new Map();
  store.traineeIndex ??= [];
  store.sessions ??= new Map();
  store.invites ??= new Map();
  store.inviteIndex ??= new Map();
  store.inviteOrder ??= [];
  store.enrichments ??= new Map();
  store.scores ??= new Map();
  store.scoreIndex ??= [];
  store.meta ??= {};

  return globalThis.__HC_SIM_MEM__;
}

/**
 * Invalidate bootstrap cache
 * Called when data changes (trainee/persona/conference created/updated)
 * Ensures Builder sees fresh data immediately
 */
export function invalidateBootstrapCache(): void {
  const store = getMemStore();
  if (store.meta.bootstrapCache) {
    console.log("[MemoryStore] Bootstrap cache invalidated");
    store.meta.bootstrapCache = undefined;
    store.meta.bootstrapCacheAt = undefined;
  }
}

/**
 * Get bootstrap cache if valid
 */
export function getBootstrapCache(): any | null {
  const store = getMemStore();
  if (
    store.meta.bootstrapCache &&
    store.meta.bootstrapCacheAt &&
    Date.now() < store.meta.bootstrapCacheAt
  ) {
    return store.meta.bootstrapCache;
  }
  return null;
}

/**
 * Set bootstrap cache with TTL
 */
export function setBootstrapCache(data: any, ttlMs: number): void {
  const store = getMemStore();
  store.meta.bootstrapCache = data;
  store.meta.bootstrapCacheAt = Date.now() + ttlMs;
}
