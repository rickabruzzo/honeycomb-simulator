/**
 * Prompt bundle store - KV persistence in production, in-memory in development.
 *
 * Stores versioned prompt bundles that control the system prompt framework
 * for all simulator conversations.
 */

import { kv } from "@vercel/kv";
import { useKv } from "../kvConfig";
import { getMemStore } from "../memoryStore";
import type { PromptBundle } from "./promptBundleTypes";
import { getDefaultPromptBundle } from "./defaultPromptBundle";

const PROMPT_BUNDLE_KEY_PREFIX = "prompt_bundle:";
const PROMPT_BUNDLE_INDEX_KEY = "prompt_bundles:index";
const ACTIVE_BUNDLE_KEY = "prompt_bundle:active";

/**
 * Helper to get in-memory store (uses global shared store).
 */
function getInMemoryStore() {
  const mem = getMemStore();

  // Initialize prompt bundle storage if not present
  if (!mem.meta.promptBundles) {
    mem.meta.promptBundles = new Map<string, PromptBundle>();
  }
  if (!mem.meta.promptBundleIndex) {
    mem.meta.promptBundleIndex = [];
  }
  if (!mem.meta.activeBundleId) {
    mem.meta.activeBundleId = "default";
  }

  return {
    bundles: mem.meta.promptBundles as Map<string, PromptBundle>,
    index: mem.meta.promptBundleIndex as string[],
    activeBundleId: mem.meta.activeBundleId as string,
  };
}

/**
 * Get a prompt bundle by ID.
 *
 * Falls back to the default bundle if the requested ID is not found.
 *
 * @param bundleId - The bundle ID to retrieve
 * @returns The prompt bundle
 */
export async function getPromptBundle(
  bundleId: string = "default"
): Promise<PromptBundle> {
  if (useKv()) {
    const bundle = await kv.get<PromptBundle>(
      `${PROMPT_BUNDLE_KEY_PREFIX}${bundleId}`
    );
    if (bundle) {
      return bundle;
    }
  } else {
    // In-memory development mode
    const store = getInMemoryStore();
    const bundle = store.bundles.get(bundleId);
    if (bundle) {
      return bundle;
    }
  }

  // Fallback to default if not found
  console.log(`[PromptBundleStore] Bundle '${bundleId}' not found, using default`);
  return getDefaultPromptBundle();
}

/**
 * Get the currently active prompt bundle.
 *
 * Returns the bundle marked as "active" for production use.
 *
 * @returns The active prompt bundle
 */
export async function getActivePromptBundle(): Promise<PromptBundle> {
  if (useKv()) {
    const activeBundleId =
      (await kv.get<string>(ACTIVE_BUNDLE_KEY)) || "default";
    return getPromptBundle(activeBundleId);
  } else {
    // In-memory development mode
    const store = getInMemoryStore();
    return getPromptBundle(store.activeBundleId);
  }
}

/**
 * Save a prompt bundle.
 *
 * Creates or updates a prompt bundle and adds it to the index if new.
 *
 * @param bundle - The prompt bundle to save
 * @returns The saved prompt bundle
 */
export async function savePromptBundle(
  bundle: PromptBundle
): Promise<PromptBundle> {
  // Update timestamp
  const updatedBundle: PromptBundle = {
    ...bundle,
    updatedAt: new Date().toISOString(),
  };

  if (useKv()) {
    // Save to KV
    await kv.set(
      `${PROMPT_BUNDLE_KEY_PREFIX}${bundle.id}`,
      updatedBundle
    );

    // Update index if new
    const index = (await kv.get<string[]>(PROMPT_BUNDLE_INDEX_KEY)) || [];
    if (!index.includes(bundle.id)) {
      index.push(bundle.id);
      await kv.set(PROMPT_BUNDLE_INDEX_KEY, index);
    }

    console.log(`[PromptBundleStore] Saved bundle '${bundle.id}' to KV`);
  } else {
    // In-memory development mode
    const store = getInMemoryStore();
    store.bundles.set(bundle.id, updatedBundle);

    if (!store.index.includes(bundle.id)) {
      store.index.push(bundle.id);
    }

    console.log(`[PromptBundleStore] Saved bundle '${bundle.id}' to memory`);
  }

  return updatedBundle;
}

/**
 * List all prompt bundles.
 *
 * @returns Array of all prompt bundles
 */
export async function listPromptBundles(): Promise<PromptBundle[]> {
  if (useKv()) {
    const index = (await kv.get<string[]>(PROMPT_BUNDLE_INDEX_KEY)) || [];
    const bundles: PromptBundle[] = [];

    for (const id of index) {
      const bundle = await kv.get<PromptBundle>(
        `${PROMPT_BUNDLE_KEY_PREFIX}${id}`
      );
      if (bundle) {
        bundles.push(bundle);
      }
    }

    return bundles;
  } else {
    // In-memory development mode
    const store = getInMemoryStore();
    return Array.from(store.bundles.values());
  }
}

/**
 * Set the active prompt bundle.
 *
 * Marks a specific bundle as the one to use for all new sessions.
 *
 * @param bundleId - The bundle ID to activate
 */
export async function setActivePromptBundle(bundleId: string): Promise<void> {
  // Verify the bundle exists
  await getPromptBundle(bundleId);

  if (useKv()) {
    await kv.set(ACTIVE_BUNDLE_KEY, bundleId);
    console.log(`[PromptBundleStore] Set active bundle to '${bundleId}' in KV`);
  } else {
    // In-memory development mode
    const mem = getMemStore();
    mem.meta.activeBundleId = bundleId;
    console.log(`[PromptBundleStore] Set active bundle to '${bundleId}' in memory`);
  }
}

/**
 * Get the currently active bundle ID.
 *
 * @returns The ID of the active bundle
 */
export async function getActiveBundleId(): Promise<string> {
  if (useKv()) {
    return (await kv.get<string>(ACTIVE_BUNDLE_KEY)) || "default";
  } else {
    const store = getInMemoryStore();
    return store.activeBundleId;
  }
}

/**
 * Ensure the default bundle is seeded.
 *
 * Idempotent operation that creates the default bundle if it doesn't exist.
 */
export async function ensureDefaultBundleSeeded(): Promise<void> {
  const bundles = await listPromptBundles();

  // Check if default bundle exists
  const hasDefault = bundles.some((b) => b.id === "default");

  if (!hasDefault) {
    const defaultBundle = getDefaultPromptBundle();
    await savePromptBundle(defaultBundle);
    await setActivePromptBundle("default");
    console.log("[PromptBundleStore] Seeded default prompt bundle");
  }
}
