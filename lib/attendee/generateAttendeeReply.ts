/**
 * Main attendee response generation engine.
 * Combines intent classification, template selection, and LLM fallback.
 */

import { SessionState } from "../storage";
import { classifyAttendeeIntent } from "./intentClassifier";
import { AttendeeIntent } from "./intentTypes";
import { TEMPLATES, DEFAULT_TOOL_STACKS } from "./templates";
import { pickVariant } from "./variantPicker";
import { postProcessAttendeeText } from "./postProcess";

export interface AttendeeReplyResult {
  text: string;
  source: "template" | "llm";
  intent?: string;
  confidence?: number;
}

/**
 * Fill template slots with context-specific values.
 */
function fillTemplateSlots(
  template: string,
  slots: {
    tool1?: string;
    tool2?: string;
    stack?: string;
    pain?: string;
    timeframe?: string;
    customerImpactPhrase?: string;
  }
): string {
  let filled = template;

  Object.entries(slots).forEach(([key, value]) => {
    if (value) {
      filled = filled.replace(new RegExp(`\\{${key}\\}`, "g"), value);
    }
  });

  // Remove any unfilled slots
  filled = filled.replace(/\{[^}]+\}/g, "");

  return filled;
}

/**
 * Determine default tool stack based on persona.
 */
function getDefaultToolStack(personaProfile: string): {
  tool1: string;
  tool2: string;
  stack: string;
} {
  const lower = personaProfile.toLowerCase();

  if (lower.includes("cto")) {
    return DEFAULT_TOOL_STACKS["CTO"];
  } else if (lower.includes("director")) {
    return DEFAULT_TOOL_STACKS["Director"];
  } else if (lower.includes("technical buyer") || lower.includes("vp")) {
    return DEFAULT_TOOL_STACKS["Technical Buyer"];
  } else if (
    lower.includes("engineer") ||
    lower.includes("sre") ||
    lower.includes("developer")
  ) {
    return DEFAULT_TOOL_STACKS["IC"];
  }

  return DEFAULT_TOOL_STACKS["default"];
}

/**
 * Generate attendee reply using template-based approach with LLM fallback.
 */
export function generateAttendeeReply(params: {
  traineeText: string;
  session: SessionState;
  traineeTurnCount: number;
}): AttendeeReplyResult | null {
  const { traineeText, session, traineeTurnCount } = params;

  // Build context for intent classification
  const recentTranscript = session.transcript
    .slice(-10)
    .map((m) => m.text)
    .join(" ");

  const context = {
    state: session.currentState,
    persona: session.kickoff.attendeeProfile,
    transcript: recentTranscript,
    expressedIntents: session.expressedIntents || [],
  };

  // Classify intent
  let intentResult = classifyAttendeeIntent(traineeText, context);

  // Apply exhaustion check and transitions
  const { applyIntentExhaustion } = require("./intentClassifier");
  intentResult = applyIntentExhaustion(
    intentResult,
    session.expressedIntents || [],
    traineeText
  );

  // If exhausted or confidence too low, return null for LLM fallback
  if (intentResult.exhausted || intentResult.confidence < 0.7) {
    return null;
  }

  // Get template for this intent
  const template = TEMPLATES[intentResult.intent];
  if (!template || template.variants.length === 0) {
    return null;
  }

  // Prepare template slots
  const slots: {
    tool1?: string;
    tool2?: string;
    stack?: string;
    pain?: string;
    timeframe?: string;
    customerImpactPhrase?: string;
  } = {};

  // Get or establish tool stack
  if (!session.toolingContext) {
    const defaultStack = getDefaultToolStack(session.kickoff.attendeeProfile);
    slots.tool1 = defaultStack.tool1;
    slots.tool2 = defaultStack.tool2;
    slots.stack = defaultStack.stack;

    // Store in session for consistency
    session.toolingContext = {
      apm: defaultStack.tool1,
      logs: defaultStack.tool2,
      stack: defaultStack.stack,
    };
  } else {
    slots.tool1 = session.toolingContext.apm || "New Relic";
    slots.tool2 = session.toolingContext.logs || "Splunk";
    slots.stack = session.toolingContext.stack || "a mix of legacy tools";
  }

  // Pick variant deterministically
  const key = `intent:${intentResult.intent}:turn:${traineeTurnCount}`;
  const selectedVariant = pickVariant(
    session.outcomeSeed || session.id,
    key,
    template.variants
  );

  // Fill slots
  const filledTemplate = fillTemplateSlots(selectedVariant, slots);

  // Post-process
  const finalText = postProcessAttendeeText(filledTemplate);

  return {
    text: finalText,
    source: "template",
    intent: intentResult.intent,
    confidence: intentResult.confidence,
  };
}
