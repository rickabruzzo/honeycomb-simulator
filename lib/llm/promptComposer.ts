/**
 * Prompt composition system.
 *
 * Composes the final system prompt from:
 * - Prompt bundle (facilitator setup + master system prompt)
 * - Simulator config rules (rendered as structured text)
 * - Scenario context (conference, persona, difficulty, enrichment)
 * - Current state behavior
 * - Optional trainer guidance
 */

import type {
  PromptBundle,
  PromptRuntimeContext,
  ComposedSystemPrompt,
} from "./promptBundleTypes";
import type { EnrichmentResult } from "./enrichmentTypes";
import {
  renderSimulatorRules,
  renderStateBehavior,
  getBannedKeywords,
} from "../simulatorConfig";
import { getActivePromptBundle } from "./promptBundleStore";

/**
 * Compose the full system prompt for an attendee response.
 *
 * This is the primary function that combines all prompt components
 * into a single system message for OpenAI.
 *
 * @param context - Runtime context (conference, persona, state, etc.)
 * @param conversationHistory - Recent message history
 * @param bundle - Optional specific bundle (defaults to active bundle)
 * @returns Composed system prompt
 */
export async function composeAttendeeSystemPrompt(
  context: PromptRuntimeContext,
  conversationHistory: Array<{ role: string; content: string }>,
  bundle?: PromptBundle
): Promise<ComposedSystemPrompt> {
  // Get active bundle if not provided
  const promptBundle = bundle || (await getActivePromptBundle());

  // Build sections
  const sections: string[] = [];

  // 1. Facilitator Setup
  sections.push(promptBundle.facilitatorSetup);

  // 2. Master System Prompt
  sections.push(promptBundle.masterSystemPrompt);

  // 3. Structured rules from simulator config
  const configRules = renderSimulatorRules();
  sections.push(configRules);

  // 4. Current state behavior
  const stateBehavior = renderStateBehavior(context.sessionState);
  sections.push(stateBehavior);

  // 5. Scenario context (conference + persona + difficulty)
  const scenarioContext = buildScenarioContext(context);
  sections.push(scenarioContext);

  // 6. Enrichment guidance (if available)
  if (context.enrichment?.promptAddendum) {
    sections.push(`\nENRICHMENT GUIDANCE:\n${context.enrichment.promptAddendum}`);
  }

  // 7. Trainer guidance (if provided)
  if (context.trainerGuidance) {
    sections.push(`\nTRAINER GUIDANCE:\n${context.trainerGuidance}`);
  }

  // 7a. Turn limit enforcement
  if (context.turnLimitExceeded) {
    sections.push(`\n⚠️ TURN LIMIT REACHED
Conversation has reached the maximum turn count for this difficulty level.
You MUST converge toward an OUTCOME now. No reopening discovery. No new exploratory questions.
Move toward a clean close with an appropriate next step (demo, self-service, or polite exit).`);
  }

  // 7b. Self-service cue detection
  if (context.selfServiceCuesDetected) {
    sections.push(`\n💡 SELF-SERVICE CUES DETECTED
The trainee has expressed self-service preferences (free tier, docs, async learning, low urgency).
This is a SUCCESS signal, not a failure. Offering self-service is an appropriate outcome.
Do not push for a demo. Move toward SELF_SERVICE_READY outcome with appropriate resources.`);
  }

  // 7c. MQL cue detection - CONVERGENCE ENFORCEMENT
  if (context.mqlCuesDetected) {
    sections.push(`\n🎯 MQL CUES DETECTED (HOT LEAD) — CONVERGE NOW
The trainee has expressed MQL interest (badge scan, sales follow-up, stakeholder conversation).
This is a SUCCESS outcome. MQL_READY is equivalent to or BETTER than DEMO_READY.

IMMEDIATE ACTIONS:
1. Acknowledge their request positively
2. Confirm the specific next step (badge scan / sales follow-up / manager intro)
3. Close the conversation cleanly within 1-2 turns
4. Do NOT reopen discovery, do NOT push for demo, do NOT over-educate

Example: "Perfect! Let me scan your badge and our team will follow up about [specific topic]. Thanks for stopping by!"`);
  }

  // 7d. Stakeholder-specific guidance
  if (context.stakeholderType === "executive") {
    sections.push(`\n👔 EXECUTIVE STAKEHOLDER DETECTED
This attendee is an executive (CTO, VP, Director, Technical Buyer).
Executives rarely want technical demos. They care about budget, cost savings, ROI, and strategic alignment.
Do NOT push technical depth. Focus on business value and leadership follow-up.
Preferred outcome: MQL_READY with sales/leadership conversation.`);
  } else if (context.stakeholderType === "ic_without_authority") {
    sections.push(`\n🔧 IC WITHOUT AUTHORITY DETECTED
This attendee is an Individual Contributor who may lack decision-making power.
They may love the product but need help advocating internally.
Offer to connect with their manager, team lead, or decision maker.
Badge scan + manager follow-up is a SUCCESS outcome (MQL_READY).`);
  }

  // 8. Recent conversation history
  const recentHistory = conversationHistory.slice(-12);
  if (recentHistory.length > 0) {
    const historyText = recentHistory
      .map((m) => `${m.role === "user" ? "Trainee" : "Attendee"}: ${m.content}`)
      .join("\n");
    sections.push(`\nRECENT CONVERSATION (most recent last):\n${historyText}`);
  }

  // 9. Final instruction
  sections.push("\nNow respond as the attendee.");

  // Compose final prompt
  const content = sections.join("\n\n");

  return {
    content,
    bundleVersion: promptBundle.version,
    composedAt: new Date().toISOString(),
    hasTrainerGuidance: !!context.trainerGuidance,
  };
}

/**
 * Build scenario context section.
 *
 * Formats conference, persona, and difficulty into a structured block.
 *
 * @param context - Runtime context
 * @returns Formatted scenario context text
 */
function buildScenarioContext(context: PromptRuntimeContext): string {
  const sections: string[] = [];

  sections.push(`SCENARIO CONTEXT:`);

  sections.push(`Conference: ${context.conference.name}`);
  sections.push(`Conference themes: ${context.conference.themes}`);

  sections.push(`\nDIFFICULTY: ${context.difficulty}`);

  sections.push(`\nYOUR HIDDEN PROFILE (do not reveal directly):`);
  sections.push(`Title: ${context.persona.title}`);
  sections.push(`Modifiers: ${context.persona.modifiers}`);
  sections.push(`Emotional posture: ${context.persona.emotionalPosture}`);
  sections.push(`Tooling bias: ${context.persona.toolingBias}`);
  sections.push(`OpenTelemetry familiarity: ${context.persona.otelFamiliarity}`);

  return sections.join("\n");
}

/**
 * Legacy compatibility function.
 *
 * Maintains backward compatibility with existing code that calls
 * buildAttendeePrompt directly. This function wraps the new
 * bundle-based composition system.
 *
 * @param currentState - Current conversation state
 * @param attendeeProfile - Legacy profile string (will be parsed)
 * @param difficulty - Difficulty level
 * @param conversationHistory - Message history
 * @param enrichment - Optional enrichment result
 * @returns System prompt string
 */
export async function buildAttendeePromptLegacy(
  currentState: string,
  attendeeProfile: string,
  difficulty: string,
  conversationHistory: Array<{ role: string; content: string }>,
  enrichment?: EnrichmentResult | null
): Promise<string> {
  // Parse legacy attendeeProfile string into structured context
  // Expected format:
  // "Persona: X\nModifiers: Y\nEmotional posture: Z\nTooling bias: A\nOpenTelemetry familiarity: B"
  const context = parseLegacyAttendeeProfile(attendeeProfile, currentState, difficulty, enrichment);

  const composed = await composeAttendeeSystemPrompt(context, conversationHistory);

  return composed.content;
}

/**
 * Parse legacy attendee profile string into PromptRuntimeContext.
 *
 * This is a compatibility helper for existing code.
 *
 * @param attendeeProfile - Legacy profile string
 * @param currentState - Current conversation state
 * @param difficulty - Difficulty level
 * @param enrichment - Optional enrichment
 * @returns Runtime context
 */
function parseLegacyAttendeeProfile(
  attendeeProfile: string,
  currentState: string,
  difficulty: string,
  enrichment?: EnrichmentResult | null
): PromptRuntimeContext {
  // Parse the profile string
  const lines = attendeeProfile.split("\n");
  const parsed: Record<string, string> = {};

  for (const line of lines) {
    const [key, ...valueParts] = line.split(":");
    if (key && valueParts.length > 0) {
      const cleanKey = key.trim();
      const value = valueParts.join(":").trim();
      parsed[cleanKey] = value;
    }
  }

  return {
    conference: {
      name: "Unknown Conference",
      themes: "General tech topics",
    },
    persona: {
      title: parsed["Persona"] || "Unknown",
      modifiers: parsed["Modifiers"] || "None",
      emotionalPosture: parsed["Emotional posture"] || "Neutral",
      toolingBias: parsed["Tooling bias"] || "None specified",
      otelFamiliarity: parsed["OpenTelemetry familiarity"] || "Unknown",
    },
    difficulty,
    enrichment: enrichment || null,
    sessionState: currentState,
    trainerGuidance: null,
  };
}
