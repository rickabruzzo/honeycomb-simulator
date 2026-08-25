/**
 * Server-startup instrumentation (Next.js `register()` hook, runs once at boot).
 *
 * 1. OpenTelemetry export. The app is richly instrumented with withSpan()/
 *    withChildSpan() (lib/telemetry.ts), but those spans only export if a tracer
 *    provider is registered at boot. ./tracing.ts starts the OpenTelemetry Node
 *    SDK and points it at Honeycomb (see also ./otelconfig.yaml, the declarative
 *    equivalent). Node.js runtime only — the SDK is a Node module.
 *
 * 2. KV env bridge. The Upstash store is provisioned via the Vercel Marketplace
 *    integration under a project-specific prefix (confsim_KV_*) that Vercel won't
 *    let us rename once connected. Our code (@vercel/kv, useKv()) reads the
 *    canonical unprefixed names, so we copy the prefixed values onto the canonical
 *    names once, at boot, before any route handler or KV command runs.
 */
export async function register() {
  // Node.js runtime only (process.env mutable; the OTEL SDK + KV client run here).
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") return;

  // 1. OpenTelemetry — dynamic import so the Node SDK never loads in the edge bundle.
  try {
    const { startTracing } = await import("./tracing");
    startTracing();
  } catch (err) {
    console.error("[otel] tracing bootstrap failed:", err);
  }

  // 2. KV env bridge.
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
