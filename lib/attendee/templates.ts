/**
 * Response template banks for booth conversations.
 * Each intent has 3-8 variant responses to reduce repetition.
 */

import { AttendeeIntent } from "./intentTypes";

export interface TemplateSlots {
  tool1?: string;
  tool2?: string;
  stack?: string;
  pain?: string;
  timeframe?: string;
  customerImpactPhrase?: string;
}

export interface Template {
  variants: string[];
  maxLength?: number; // Character limit
}

/**
 * Template library keyed by intent.
 */
export const TEMPLATES: Record<AttendeeIntent, Template> = {
  [AttendeeIntent.ASK_WHAT_IS_HONEYCOMB]: {
    variants: [
      "I've seen the booth but I'm not totally clear on what you do.",
      "I know you're observability, but what makes you different?",
      "Haven't really used Honeycomb before. What's the pitch?",
    ],
    maxLength: 120,
  },

  [AttendeeIntent.ASK_TOOL_STACK]: {
    variants: [
      "We're on {tool1} and {tool2}.",
      "Currently using {tool1} for metrics and {tool2} for logs.",
      "{tool1} and {tool2}, mostly. It's a mix of legacy APM stuff.",
      "We have {tool1} for monitoring and {tool2} for log aggregation.",
      "{stack}. Pretty standard setup.",
    ],
    maxLength: 150,
  },

  [AttendeeIntent.ASK_DIFFERENTIATION]: {
    variants: [
      "How's this different from what {tool1} does?",
      "We're already using {tool1}. Why would we switch?",
      "What do you have that {tool1} doesn't?",
      "I've heard about you but {tool1} seems similar. What's the real difference?",
    ],
    maxLength: 150,
  },

  [AttendeeIntent.DESCRIBE_PAIN_INCIDENT]: {
    variants: [
      "Correlating across services is brutal. We end up digging through logs for hours.",
      "During incidents we're just grepping logs and guessing. It's a nightmare.",
      "The worst part is not knowing where to start. Too many places to look.",
      "We waste so much time just trying to figure out which service is the culprit.",
      "Honestly, we're flying blind half the time. Incidents take forever to resolve.",
    ],
    maxLength: 180,
  },

  [AttendeeIntent.DESCRIBE_PAIN_CORRELATION]: {
    variants: [
      "Connecting the dots between services is the hardest part.",
      "We can see symptoms but figuring out root cause is a slog.",
      "Tracing is a mess. We don't have good visibility into request flows.",
      "Cross-service debugging takes forever. Everything's siloed.",
    ],
    maxLength: 150,
  },

  [AttendeeIntent.DESCRIBE_PAIN_ALERT_FATIGUE]: {
    variants: [
      "We're drowning in alerts. Half of them are noise.",
      "Alert fatigue is real. The team just ignores most of them now.",
      "Too many false positives. It's hard to know what's actually critical.",
      "We get paged constantly but most alerts don't mean anything.",
    ],
    maxLength: 150,
  },

  [AttendeeIntent.DESCRIBE_PAIN_BLIND_SPOTS]: {
    variants: [
      "We don't know what we don't know. The unknowns are what kill us.",
      "Our dashboards only show what we thought to build. Everything else is invisible.",
      "We're reactive. By the time we see something, customers already felt it.",
    ],
    maxLength: 150,
  },

  [AttendeeIntent.ASK_OTEL]: {
    variants: [
      "Does Honeycomb require OpenTelemetry? We haven't adopted it yet.",
      "How locked in are we if we use your instrumentation?",
      "We're not on OTel. Is that a blocker?",
      "What's the story with OpenTelemetry and Honeycomb?",
    ],
    maxLength: 140,
  },

  [AttendeeIntent.ASK_INSTRUMENTATION]: {
    variants: [
      "How much instrumentation work is required to get value?",
      "Do we need to instrument everything or can we start small?",
      "What's involved in getting data into Honeycomb?",
      "Is there an agent or do we use SDKs?",
    ],
    maxLength: 140,
  },

  [AttendeeIntent.ASK_INTEGRATION]: {
    variants: [
      "Does it integrate with our existing stack?",
      "Can we pull in data from {tool1} and {tool2}?",
      "We're already invested in {tool1}. Can Honeycomb work alongside it?",
    ],
    maxLength: 130,
  },

  [AttendeeIntent.ASK_DATA_INGESTION]: {
    variants: [
      "How do we actually get data in? Is there an agent?",
      "What's the ingestion model? Are there collectors?",
      "Do we send events directly or is there a sidecar?",
    ],
    maxLength: 130,
  },

  [AttendeeIntent.ASK_ROLLOUT_EFFORT]: {
    variants: [
      "How much effort is the rollout? We're pretty lean on bandwidth.",
      "What's the migration story? We can't rip and replace everything.",
      "How long does it take to get value? We need quick wins.",
      "Our team's stretched thin. Is this a heavy lift?",
    ],
    maxLength: 140,
  },

  [AttendeeIntent.ASK_TEAM_BANDWIDTH]: {
    variants: [
      "We don't have a ton of bandwidth right now. Can we start small?",
      "The team's already underwater. How hands-on is the setup?",
      "Is there a low-effort way to evaluate this?",
    ],
    maxLength: 130,
  },

  [AttendeeIntent.ASK_PRICING]: {
    variants: [
      "What's the pricing model? Is it per-seat or per-event?",
      "We're cost-conscious. How does pricing work?",
      "What's the entry point cost-wise?",
    ],
    maxLength: 120,
  },

  [AttendeeIntent.ASK_CUSTOMER_IMPACT]: {
    variants: [
      "Our last outage cost us customers. Can Honeycomb help us catch issues faster?",
      "We need to reduce customer impact during incidents. Does this help?",
      "{customerImpactPhrase}. Can you help with that?",
    ],
    maxLength: 150,
  },

  [AttendeeIntent.ASK_NEXT_STEPS]: {
    variants: [
      "What's the best next step for us?",
      "How do people usually get started?",
      "What would you recommend as a next step?",
    ],
    maxLength: 100,
  },

  [AttendeeIntent.SELF_SERVICE_CLOSE]: {
    variants: [
      "I'd rather start with the docs and poke around the free tier first.",
      "Docs and free tier is probably the right next step for me.",
      "Can you point me to the docs? I'll dig in on my own.",
      "I'll check out the free tier and see how it feels.",
    ],
    maxLength: 140,
  },

  [AttendeeIntent.MQL_CLOSE]: {
    variants: [
      "Can you scan my badge? I'd like someone from sales to follow up.",
      "Let me give you my contact info. Have sales reach out.",
      "Scan my badge. We should talk more seriously about this.",
      "I'm interested. Can someone follow up with me?",
    ],
    maxLength: 140,
  },

  [AttendeeIntent.DEFERRED_INTEREST_CLOSE]: {
    variants: [
      "This is interesting but we're not ready yet. Maybe later this year.",
      "Not urgent right now, but I'll keep you on the radar.",
      "We're evaluating options but timing isn't right yet.",
      "Sounds promising but we have other priorities first.",
    ],
    maxLength: 140,
  },

  [AttendeeIntent.DEMO_INTEREST]: {
    variants: [
      "Can you show me how this works in practice?",
      "I'd like to see it in action. Is there a demo?",
      "Walk me through how you'd debug something with Honeycomb.",
    ],
    maxLength: 120,
  },

  [AttendeeIntent.UNKNOWN]: {
    variants: [""],
    maxLength: 0,
  },
};

/**
 * Default tool stacks by persona type (used when tooling context not yet established).
 */
export const DEFAULT_TOOL_STACKS: Record<string, { tool1: string; tool2: string; stack: string }> = {
  "CTO": {
    tool1: "New Relic",
    tool2: "Splunk",
    stack: "New Relic and Splunk",
  },
  "Director": {
    tool1: "Datadog",
    tool2: "ELK Stack",
    stack: "Datadog for metrics, ELK for logs",
  },
  "IC": {
    tool1: "Prometheus",
    tool2: "Grafana",
    stack: "Prometheus and Grafana",
  },
  "Technical Buyer": {
    tool1: "New Relic",
    tool2: "Splunk",
    stack: "New Relic and Splunk, mostly legacy",
  },
  "default": {
    tool1: "New Relic",
    tool2: "Splunk",
    stack: "a mix of legacy APM tools",
  },
};
