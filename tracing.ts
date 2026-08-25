/**
 * OpenTelemetry SDK bootstrap — the "tracing.js" init, as TypeScript and adapted
 * to Next.js (started from instrumentation.ts's register() hook in the Node.js
 * runtime, since `node -r ./tracing.js next` is not how Next boots).
 *
 * WHY THIS MIRRORS otelconfig.yaml INSTEAD OF LOADING IT:
 * The intended source of truth is ./otelconfig.yaml, pointed at via
 * OTEL_EXPERIMENTAL_CONFIG_FILE. But the installed @opentelemetry/sdk-node@0.211
 * only wires the declarative-config file through its experimental `startNodeSDK()`
 * path, which currently registers instrumentations/propagators but does NOT build
 * the tracer/meter/logger providers or their exporters from the file — so the yaml
 * alone exports nothing on this version. Until that lands upstream, this file
 * implements the same config in code (same OTLP endpoint, same x-honeycomb-team
 * key, same service.name), so behavior matches the yaml exactly.
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

let started = false;

export function startTracing(): void {
  if (started) return;
  started = true;

  // x-honeycomb-team = the ingest key secret (mirrors otelconfig.yaml's ${HONEYCOMB_API_KEY}).
  const key = process.env.HONEYCOMB_API_KEY;
  if (!key) {
    console.warn("[otel] HONEYCOMB_API_KEY not set — OpenTelemetry traces will NOT export.");
    return;
  }

  // Honeycomb OTLP/HTTP traces endpoint. In a Honeycomb Environments team the TRACES
  // dataset is derived from service.name, so no x-honeycomb-dataset header is sent here.
  const endpoint =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.replace(/\/+$/, "") ||
    "https://api.honeycomb.io";

  // Tag every span with the deployment environment so local dev traffic (which exports to the
  // same Honeycomb dataset, since .env.local carries the same ingest key) is cleanly separable
  // from real Vercel traffic. `VERCEL_ENV` is production | preview on Vercel, unset locally.
  // Picked up by the SDK's env-var resource detector (autoDetectResources is on by default).
  const deploymentEnv = process.env.VERCEL_ENV || "development";
  process.env.OTEL_RESOURCE_ATTRIBUTES = [
    process.env.OTEL_RESOURCE_ATTRIBUTES,
    `deployment.environment=${deploymentEnv}`,
    `deployment.environment.name=${deploymentEnv}`,
  ]
    .filter(Boolean)
    .join(",");

  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME || "honeycomb-simulator",
    traceExporter: new OTLPTraceExporter({
      url: `${endpoint}/v1/traces`,
      headers: { "x-honeycomb-team": key },
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // fs auto-instrumentation is noisy/expensive during startup — disable it.
        "@opentelemetry/instrumentation-fs": { enabled: false },
      }),
    ],
  });

  try {
    sdk.start();
    console.log(
      `[otel] OpenTelemetry SDK started — exporting traces to ${endpoint}/v1/traces ` +
        `(service.name=${process.env.OTEL_SERVICE_NAME || "honeycomb-simulator"}).`
    );
  } catch (err) {
    // Never let telemetry setup take down the server.
    console.error("[otel] Failed to start OpenTelemetry SDK:", err);
  }

  // Flush on shutdown so the last spans aren't lost.
  const shutdown = () => {
    sdk.shutdown().catch(() => {});
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
