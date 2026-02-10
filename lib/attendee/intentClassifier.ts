/**
 * Intent classifier for booth conversations.
 * Maps trainee messages to attendee intents using keyword/phrase matching.
 */

import { AttendeeIntent, IntentResult } from "./intentTypes";

/**
 * Normalize text for matching: lowercase, collapse whitespace, strip punctuation.
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check if text contains any of the given phrases.
 */
function containsAny(text: string, phrases: string[]): boolean {
  const normalized = normalizeText(text);
  return phrases.some((phrase) => normalized.includes(normalizeText(phrase)));
}

/**
 * Classify trainee message into attendee intent.
 */
export function classifyAttendeeIntent(
  traineeText: string,
  context: {
    state: string;
    persona: string;
    transcript: string;
    expressedIntents?: string[];
  }
): IntentResult {
  const signals: string[] = [];
  const expressedIntents = context.expressedIntents || [];

  // TRACING PIVOT RULE: If trainee mentions "no tracing", force transition to effort/urgency
  if (
    containsAny(traineeText, [
      "no tracing",
      "don't have traces",
      "no distributed tracing",
      "metrics and logs only",
      "just metrics and logs",
    ])
  ) {
    signals.push("no_tracing_pivot");
    // Force transition to effort/capacity concerns
    return {
      intent: AttendeeIntent.ASK_ROLLOUT_EFFORT,
      confidence: 0.85,
      signals,
      exhausted: false,
    };
  }

  // ASK_WHAT_IS_HONEYCOMB
  if (
    containsAny(traineeText, [
      "what is honeycomb",
      "what does honeycomb do",
      "tell me about honeycomb",
      "never heard of honeycomb",
      "honeycomb is",
    ])
  ) {
    signals.push("what_is_honeycomb");
    return {
      intent: AttendeeIntent.ASK_WHAT_IS_HONEYCOMB,
      confidence: 0.9,
      signals,
      exhausted: false,
    };
  }

  // ASK_TOOL_STACK
  if (
    containsAny(traineeText, [
      "what are you using",
      "what tools",
      "current setup",
      "your stack",
      "what do you have",
      "what's your observability",
    ])
  ) {
    signals.push("ask_tool_stack");
    return {
      intent: AttendeeIntent.ASK_TOOL_STACK,
      confidence: 0.9,
      signals,
      exhausted: false,
    };
  }

  // ASK_DIFFERENTIATION
  if (
    containsAny(traineeText, [
      "how are you different",
      "what makes honeycomb different",
      "honeycomb vs",
      "compared to datadog",
      "compared to splunk",
      "compared to new relic",
      "better than",
      "why honeycomb",
    ])
  ) {
    signals.push("ask_differentiation");
    return {
      intent: AttendeeIntent.ASK_DIFFERENTIATION,
      confidence: 0.9,
      signals,
      exhausted: false,
    };
  }

  // DESCRIBE_PAIN_INCIDENT
  if (
    containsAny(traineeText, [
      "during an incident",
      "when things break",
      "during an outage",
      "when debugging",
      "troubleshooting",
      "fire drill",
      "what's hardest",
      "biggest pain",
    ])
  ) {
    signals.push("describe_pain_incident");
    return {
      intent: AttendeeIntent.DESCRIBE_PAIN_INCIDENT,
      confidence: 0.85,
      signals,
      exhausted: false,
    };
  }

  // DESCRIBE_PAIN_CORRELATION
  if (
    containsAny(traineeText, [
      "correlation",
      "connecting",
      "relate",
      "span",
      "traces",
      "distributed tracing",
      "cross-service",
    ])
  ) {
    signals.push("describe_pain_correlation");
    return {
      intent: AttendeeIntent.DESCRIBE_PAIN_CORRELATION,
      confidence: 0.8,
      signals,
      exhausted: false,
    };
  }

  // DESCRIBE_PAIN_ALERT_FATIGUE
  if (
    containsAny(traineeText, [
      "alert fatigue",
      "too many alerts",
      "noisy",
      "false positives",
      "alert overload",
    ])
  ) {
    signals.push("describe_pain_alert_fatigue");
    return {
      intent: AttendeeIntent.DESCRIBE_PAIN_ALERT_FATIGUE,
      confidence: 0.85,
      signals,
      exhausted: false,
    };
  }

  // ASK_OTEL
  if (
    containsAny(traineeText, [
      "opentelemetry",
      "otel",
      "open telemetry",
      "vendor lock",
      "does honeycomb require otel",
    ])
  ) {
    signals.push("ask_otel");
    return {
      intent: AttendeeIntent.ASK_OTEL,
      confidence: 0.9,
      signals,
      exhausted: false,
    };
  }

  // ASK_INSTRUMENTATION
  if (
    containsAny(traineeText, [
      "instrumentation",
      "how do we instrument",
      "get data in",
      "agent",
      "collector",
      "sdk",
    ])
  ) {
    signals.push("ask_instrumentation");
    return {
      intent: AttendeeIntent.ASK_INSTRUMENTATION,
      confidence: 0.8,
      signals,
      exhausted: false,
    };
  }

  // ASK_ROLLOUT_EFFORT
  if (
    containsAny(traineeText, [
      "how much effort",
      "how hard",
      "how long",
      "rollout",
      "migration",
      "time to value",
      "onboarding",
      "setup",
    ])
  ) {
    signals.push("ask_rollout_effort");
    return {
      intent: AttendeeIntent.ASK_ROLLOUT_EFFORT,
      confidence: 0.85,
      signals,
      exhausted: false,
    };
  }

  // ASK_PRICING
  if (
    containsAny(traineeText, [
      "pricing",
      "cost",
      "budget",
      "how much",
      "expensive",
      "price",
    ])
  ) {
    signals.push("ask_pricing");
    return {
      intent: AttendeeIntent.ASK_PRICING,
      confidence: 0.9,
      signals,
      exhausted: false,
    };
  }

  // DEMO_INTEREST
  if (
    containsAny(traineeText, [
      "show me",
      "demo",
      "walk me through",
      "see it",
      "can you show",
    ])
  ) {
    signals.push("demo_interest");
    return {
      intent: AttendeeIntent.DEMO_INTEREST,
      confidence: 0.9,
      signals,
      exhausted: false,
    };
  }

  // SELF_SERVICE_CLOSE
  if (
    containsAny(traineeText, [
      "free tier",
      "docs",
      "documentation",
      "try it myself",
      "case studies",
      "self-serve",
    ])
  ) {
    signals.push("self_service_close");
    return {
      intent: AttendeeIntent.SELF_SERVICE_CLOSE,
      confidence: 0.9,
      signals,
      exhausted: false,
    };
  }

  // MQL_CLOSE
  if (
    containsAny(traineeText, [
      "scan my badge",
      "have sales",
      "follow up",
      "reach out",
      "contact me",
    ])
  ) {
    signals.push("mql_close");
    return {
      intent: AttendeeIntent.MQL_CLOSE,
      confidence: 0.9,
      signals,
      exhausted: false,
    };
  }

  // ASK_NEXT_STEPS
  if (
    containsAny(traineeText, [
      "what's next",
      "next steps",
      "where do we go",
      "how do we proceed",
    ])
  ) {
    signals.push("ask_next_steps");
    return {
      intent: AttendeeIntent.ASK_NEXT_STEPS,
      confidence: 0.8,
      signals,
      exhausted: false,
    };
  }

  // DEFERRED_INTEREST_CLOSE
  if (
    containsAny(traineeText, [
      "later",
      "down the road",
      "in the future",
      "not ready yet",
      "not urgent",
    ])
  ) {
    signals.push("deferred_interest");
    return {
      intent: AttendeeIntent.DEFERRED_INTEREST_CLOSE,
      confidence: 0.85,
      signals,
      exhausted: false,
    };
  }

  // Default: UNKNOWN
  return {
    intent: AttendeeIntent.UNKNOWN,
    confidence: 0.5,
    signals: [],
    exhausted: false,
  };
}

/**
 * Check if intent was already expressed with high confidence.
 */
function isIntentExhausted(
  intent: AttendeeIntent,
  expressedIntents: string[]
): boolean {
  return expressedIntents.includes(intent);
}

/**
 * Get transition intent when primary intent is exhausted.
 * Pain intents should transition to effort/urgency/next-steps.
 */
function getTransitionIntent(
  exhaustedIntent: AttendeeIntent,
  traineeText: string
): AttendeeIntent | null {
  // Pain transitions
  if (
    exhaustedIntent === AttendeeIntent.DESCRIBE_PAIN_INCIDENT ||
    exhaustedIntent === AttendeeIntent.DESCRIBE_PAIN_CORRELATION ||
    exhaustedIntent === AttendeeIntent.DESCRIBE_PAIN_ALERT_FATIGUE ||
    exhaustedIntent === AttendeeIntent.DESCRIBE_PAIN_BLIND_SPOTS
  ) {
    // Check for effort cues
    if (
      containsAny(traineeText, [
        "how much effort",
        "how hard",
        "rollout",
        "migration",
      ])
    ) {
      return AttendeeIntent.ASK_ROLLOUT_EFFORT;
    }
    // Check for urgency cues
    if (
      containsAny(traineeText, [
        "how urgent",
        "timeline",
        "when",
        "priority",
      ])
    ) {
      return AttendeeIntent.ASK_CUSTOMER_IMPACT;
    }
    // Default: move to next steps
    return AttendeeIntent.ASK_NEXT_STEPS;
  }

  // Tool stack exhaustion → move to pain
  if (exhaustedIntent === AttendeeIntent.ASK_TOOL_STACK) {
    return AttendeeIntent.DESCRIBE_PAIN_INCIDENT;
  }

  return null;
}

/**
 * Apply exhaustion check and transitions to intent result.
 */
export function applyIntentExhaustion(
  result: IntentResult,
  expressedIntents: string[],
  traineeText: string
): IntentResult {
  // Check if already expressed
  const exhausted = isIntentExhausted(result.intent, expressedIntents);

  if (exhausted && result.confidence >= 0.8) {
    // Try transition
    const transitionIntent = getTransitionIntent(result.intent, traineeText);

    if (transitionIntent) {
      return {
        intent: transitionIntent,
        confidence: result.confidence * 0.9, // Slightly lower confidence
        signals: [...result.signals, "intent_transition"],
        exhausted: false,
      };
    }

    // No transition available - mark as exhausted
    return {
      ...result,
      exhausted: true,
    };
  }

  return {
    ...result,
    exhausted: false,
  };
}
