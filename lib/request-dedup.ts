/**
 * Request Deduplication
 *
 * Prevents duplicate in-flight requests for the same resource.
 * Multiple concurrent calls to the same key will share a single Promise.
 *
 * ✅ QUICK WIN: Prevents redundant API calls when same resource is requested multiple times
 * - Example: Multiple components requesting same persona data simultaneously
 * - Saves: N-1 duplicate calls → 1 shared call
 */

const pendingRequests = new Map<string, Promise<any>>();

/**
 * Deduplicate in-flight requests by key
 *
 * @param key Unique identifier for this request (e.g., "persona:sre-canonical")
 * @param fetchFn Function that performs the actual fetch
 * @returns Promise that resolves to the fetched data
 *
 * @example
 * const persona = await dedupedFetch(
 *   `persona:${personaId}`,
 *   () => getPersona(personaId)
 * );
 */
export async function dedupedFetch<T>(
  key: string,
  fetchFn: () => Promise<T>
): Promise<T> {
  // Return existing in-flight request if available
  if (pendingRequests.has(key)) {
    return pendingRequests.get(key) as Promise<T>;
  }

  // Create new request and track it
  const promise = fetchFn().finally(() => {
    // Clean up after completion (success or failure)
    pendingRequests.delete(key);
  });

  pendingRequests.set(key, promise);
  return promise;
}

/**
 * Clear all pending requests (useful for testing)
 */
export function clearPendingRequests(): void {
  pendingRequests.clear();
}

/**
 * Get count of currently pending requests (for observability)
 */
export function getPendingRequestCount(): number {
  return pendingRequests.size;
}

/**
 * Check if a request is currently pending
 */
export function isPending(key: string): boolean {
  return pendingRequests.has(key);
}
