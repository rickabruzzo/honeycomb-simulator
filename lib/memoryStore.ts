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
  invites: Map<string, InviteRecord>;
  inviteIndex: Map<string, string>; // token -> sessionId
  enrichments: Map<string, EnrichmentResult>;
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
      enrichments: new Map(),
      meta: {},
    };
  }
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
