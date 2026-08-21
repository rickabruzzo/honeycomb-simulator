/**
 * Server-startup instrumentation.
 *
 * The KV (Upstash Redis) store is provisioned through the Vercel Marketplace
 * integration, which writes its connection vars under a project-specific prefix
 * (`confsim_KV_REST_API_URL`, `confsim_KV_REST_API_TOKEN`, …). Vercel does not
 * allow that prefix to be renamed once the store is connected to the project.
 *
 * Our code — `@vercel/kv` and `useKv()` in lib/kvConfig.ts — reads the canonical,
 * unprefixed names (`KV_REST_API_URL`, `KV_REST_API_TOKEN`, …). This bridges the
 * two by copying the prefixed values onto the canonical names once, at server
 * boot, before any route handler or KV command runs. Existing canonical values
 * (if ever set directly) win and are left untouched.
 */
export async function register() {
  // Only meaningful in the Node.js runtime, where process.env is mutable and the
  // KV client actually runs.
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") return;

  const aliases: Record<string, string> = {
    confsim_KV_REST_API_URL: "KV_REST_API_URL",
    confsim_KV_REST_API_TOKEN: "KV_REST_API_TOKEN",
    confsim_KV_REST_API_READ_ONLY_TOKEN: "KV_REST_API_READ_ONLY_TOKEN",
    confsim_KV_URL: "KV_URL",
    confsim_REDIS_URL: "REDIS_URL",
  };

  for (const [prefixed, canonical] of Object.entries(aliases)) {
    if (!process.env[canonical] && process.env[prefixed]) {
      process.env[canonical] = process.env[prefixed];
    }
  }
}
