// tracing.js
'use strict';

const opentelemetry = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');

// Determine if we should export traces based on environment
function shouldExportTraces() {
  // VERCEL_ENV is set by Vercel: 'production', 'preview', or 'development'
  const vercelEnv = process.env.VERCEL_ENV;
  const nodeEnv = process.env.NODE_ENV;

  // Only export in Vercel Production
  if (vercelEnv === 'production') {
    return true;
  }

  // Do not export in local dev or Vercel preview
  return false;
}

const shouldExport = shouldExportTraces();

// Log tracing status (server-side only)
console.log('[OpenTelemetry] Environment:', {
  VERCEL_ENV: process.env.VERCEL_ENV || 'undefined',
  NODE_ENV: process.env.NODE_ENV || 'undefined',
  exporting: shouldExport,
});

const sdk = new opentelemetry.NodeSDK({
  serviceName: 'honeycomb-simulator',
  traceExporter: shouldExport ? new OTLPTraceExporter() : undefined,
  instrumentations: [
    getNodeAutoInstrumentations({
      // we recommend disabling fs autoinstrumentation since it can be noisy
      // and expensive during startup
      '@opentelemetry/instrumentation-fs': {
        enabled: false,
      },
    }),
  ],
});

// Only start SDK if we're exporting or need instrumentation
// Note: We still start SDK even when not exporting to maintain instrumentation
// but without an exporter, traces won't be sent anywhere
sdk.start();

if (shouldExport) {
  console.log('[OpenTelemetry] ✓ Tracing enabled - exporting to Honeycomb');
} else {
  console.log('[OpenTelemetry] ○ Tracing instrumented but NOT exporting (local/preview)');
}
