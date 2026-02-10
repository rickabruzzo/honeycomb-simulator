/**
 * Intent classification types for attendee response generation.
 * Used to map trainee messages to template-based responses.
 */

export enum AttendeeIntent {
  // Discovery & exploration
  ASK_WHAT_IS_HONEYCOMB = "ask_what_is_honeycomb",
  ASK_DIFFERENTIATION = "ask_differentiation",
  ASK_TOOL_STACK = "ask_tool_stack",

  // Pain & challenges
  DESCRIBE_PAIN_INCIDENT = "describe_pain_incident",
  DESCRIBE_PAIN_CORRELATION = "describe_pain_correlation",
  DESCRIBE_PAIN_BLIND_SPOTS = "describe_pain_blind_spots",
  DESCRIBE_PAIN_ALERT_FATIGUE = "describe_pain_alert_fatigue",

  // Technical details
  ASK_OTEL = "ask_otel",
  ASK_INSTRUMENTATION = "ask_instrumentation",
  ASK_INTEGRATION = "ask_integration",
  ASK_DATA_INGESTION = "ask_data_ingestion",

  // Evaluation concerns
  ASK_ROLLOUT_EFFORT = "ask_rollout_effort",
  ASK_TEAM_BANDWIDTH = "ask_team_bandwidth",
  ASK_PRICING = "ask_pricing",
  ASK_CUSTOMER_IMPACT = "ask_customer_impact",

  // Next steps
  ASK_NEXT_STEPS = "ask_next_steps",
  SELF_SERVICE_CLOSE = "self_service_close",
  MQL_CLOSE = "mql_close",
  DEFERRED_INTEREST_CLOSE = "deferred_interest_close",
  DEMO_INTEREST = "demo_interest",

  // Fallback
  UNKNOWN = "unknown",
}

export interface IntentResult {
  intent: AttendeeIntent;
  confidence: number;
  signals: string[];
  exhausted: boolean; // True if this intent was already expressed
}
