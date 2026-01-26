/**
 * Telemetry Utility
 * Helpers for creating custom OpenTelemetry spans
 */

import { trace, context, SpanStatusCode, Span } from "@opentelemetry/api";

const tracer = trace.getTracer("honeycomb-simulator");

export interface SpanAttributes {
  [key: string]: string | number | boolean | undefined;
}

/**
 * Create and execute a span with automatic error handling
 *
 * Usage:
 * ```
 * await withSpan("hc.event.bootstrap", async (span) => {
 *   span.setAttribute("route", "/api/bootstrap");
 *   // ... your code ...
 *   return result;
 * }, { route: "/api/bootstrap", method: "GET" });
 * ```
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  attributes: SpanAttributes = {}
): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    try {
      const startTime = Date.now();

      // Set initial attributes
      Object.entries(attributes).forEach(([key, value]) => {
        if (value !== undefined) {
          span.setAttribute(key, value);
        }
      });

      // Execute function
      const result = await fn(span);

      // Add duration
      const duration = Date.now() - startTime;
      span.setAttribute("duration_ms", duration);

      // Mark as successful
      span.setStatus({ code: SpanStatusCode.OK });

      return result;
    } catch (error) {
      // Record error
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : "Unknown error",
      });

      // Add error attributes
      span.setAttribute("error", true);
      span.setAttribute("error.type", error instanceof Error ? error.constructor.name : "unknown");
      span.setAttribute("error.message", error instanceof Error ? error.message : "Unknown error");

      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Create a child span for external dependency calls
 *
 * Usage:
 * ```
 * await withChildSpan("hc.dep.openai.chat", async (span) => {
 *   span.setAttribute("model", "gpt-4");
 *   const result = await openai.chat.completions.create(...);
 *   return result;
 * }, { dep_type: "openai", model: "gpt-4" });
 * ```
 */
export async function withChildSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  attributes: SpanAttributes = {}
): Promise<T> {
  // Get current span from context (if exists)
  const parentSpan = trace.getSpan(context.active());

  return tracer.startActiveSpan(
    name,
    { attributes: attributes as Record<string, string | number | boolean> },
    async (span) => {
      try {
        const startTime = Date.now();

        // Execute function
        const result = await fn(span);

        // Add duration
        const duration = Date.now() - startTime;
        span.setAttribute("duration_ms", duration);

        span.setStatus({ code: SpanStatusCode.OK });

        return result;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : "Unknown error",
        });

        span.setAttribute("error", true);
        span.setAttribute("error.type", error instanceof Error ? error.constructor.name : "unknown");
        span.setAttribute("error.message", error instanceof Error ? error.message : "Unknown error");

        throw error;
      } finally {
        span.end();
      }
    }
  );
}

/**
 * Add attributes to the current active span
 */
export function addSpanAttributes(attributes: SpanAttributes): void {
  const span = trace.getSpan(context.active());
  if (span) {
    Object.entries(attributes).forEach(([key, value]) => {
      if (value !== undefined) {
        span.setAttribute(key, value);
      }
    });
  }
}

/**
 * Record an event on the current active span
 */
export function recordSpanEvent(name: string, attributes: SpanAttributes = {}): void {
  const span = trace.getSpan(context.active());
  if (span) {
    span.addEvent(name, attributes as Record<string, string | number | boolean>);
  }
}
