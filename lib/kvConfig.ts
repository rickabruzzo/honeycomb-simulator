/**
 * KV Configuration Utility
 * Determines whether to use Vercel KV or in-memory storage
 */

/**
 * Check if KV should be used based on environment
 * - In production: always use KV if configured
 * - In development: use in-memory by default (faster), unless FORCE_VERCEL_KV=true
 */
export function useKv(): boolean {
  const hasKvConfig = Boolean(
    process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
  );

  if (!hasKvConfig) {
    return false;
  }

  // In development, prefer in-memory unless explicitly forced
  const isDev = process.env.NODE_ENV === "development";
  const forceKv = process.env.FORCE_VERCEL_KV === "true";

  if (isDev && !forceKv) {
    return false;
  }

  return true;
}
