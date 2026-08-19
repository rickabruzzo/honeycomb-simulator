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
import {
  getLengthBudget,
  renderLengthDirective,
} from "../attendee/lengthBudget";

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
  // Enrichment previously contributed only promptAddendum; everything else it generates was
  // stored and discarded. ventingTriggers, resistIfPitched, revealWhenEarned, and avoidTerms
  // are per-persona behavioral data that map directly onto the mechanics this simulator is
  // built around, so they now reach the prompt too.
  if (context.enrichment) {
    const e = context.enrichment;
    const enrichmentLines: string[] = [];

    if (e.promptAddendum) enrichmentLines.push(e.promptAddendum);

    const venting = e.attendeeStyleGuide?.ventingTriggers ?? [];
    if (venting.length) {
      enrichmentLines.push(
        `What gets you talking: ${venting.join("; ")}. When one of these shows up and the ` +
          `staffer has actually listened, let yourself go further than you normally would.`
      );
    }

    const resist = e.personaBehavior?.resistIfPitched ?? [];
    if (resist.length) {
      enrichmentLines.push(
        `What makes you close up: ${resist.join("; ")}. Go shorter and cooler - do not say why.`
      );
    }

    const reveal = e.personaBehavior?.revealWhenEarned ?? [];
    if (reveal.length) {
      enrichmentLines.push(
        `Hold these back until the staffer earns them: ${reveal.join("; ")}.`
      );
    }

    const avoid = e.vocabHints?.avoidTerms ?? [];
    if (avoid.length) {
      enrichmentLines.push(
        `Words you would not use: ${avoid.join(", ")}. Say it your own way instead.`
      );
    }

    const mirror = e.vocabHints?.mirrorTerms ?? [];
    if (mirror.length) {
      enrichmentLines.push(`Language that sounds like you: ${mirror.join(", ")}.`);
    }

    if (enrichmentLines.length) {
      sections.push(`\nENRICHMENT GUIDANCE:\n${enrichmentLines.join("\n\n")}`);
    }
  }

  // 7. Trainer guidance (if provided)
  if (context.trainerGuidance) {
    sections.push(`\nTRAINER GUIDANCE:\n${context.trainerGuidance}`);
  }

  // 7a. Turn limit enforcement
  if (context.turnLimitExceeded) {
    sections.push(`\nTIME PRESSURE
You have been at this booth a while and need to move on soon. Keep replies short and start
looking for a natural end. That end may be a next step, or it may simply be a polite exit -
whichever honestly fits what you have actually heard.`);
  }

  // 7b. Self-service cue detection
  if (context.selfServiceCuesDetected) {
    sections.push(`\nSELF-SERVICE PATH OFFERED
The staffer has pointed you toward something you could explore on your own. If that genuinely
suits how you like to evaluate tools, accepting it is a perfectly good ending. If it does not,
you are not obliged to take it.`);
  }

  // 7c. MQL cue detection - CONVERGENCE ENFORCEMENT
  if (context.mqlCuesDetected) {
    sections.push(`\nFOLLOW-UP PATH OFFERED
The staffer has offered a follow-up path - scanning your badge, a colleague reaching out, or
an introduction. If that genuinely fits what you need, you may accept it plainly and wrap up.
Only accept a next step you would actually accept given what you have heard.

Watch the direction: THEY scan YOUR badge and THEY follow up with YOU. Never offer to scan
your own badge, to follow up with them, or to schedule anything yourself.`);
  }

  // 7d. Stakeholder-specific guidance
  if (context.stakeholderType === "executive") {
    sections.push(`\nWHAT YOU WEIGH
You are senior enough that your attention goes to cost, delivery risk, customer impact, and
whether your teams could realistically adopt something. You may still want to see the tool -
do not rule that out - but consequence matters more to you than hands-on detail.`);
  } else if (context.stakeholderType === "ic_without_authority") {
    sections.push(`\nWHAT YOU WEIGH
You do the hands-on work but you do not control the budget. If something looks genuinely
useful, your instinct is to work out how you would make the case internally.`);
  }

  // 8. Recent conversation history
  const recentHistory = conversationHistory.slice(-12);
  if (recentHistory.length > 0) {
    const historyText = recentHistory
      .map((m) => `${m.role === "user" ? "Trainee" : "Attendee"}: ${m.content}`)
      .join("\n");
    sections.push(`\nRECENT CONVERSATION (most recent last):\n${historyText}`);
  }

  // 8b. Reply length budget. Phase-derived for now; should become trust-derived so that
  //      being listened to visibly buys longer, more candid answers.
  sections.push(`\n${renderLengthDirective(getLengthBudget(context.sessionState))}`);

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

  sections.push(`\nYOUR HIDDEN PROFILE (do not reveal directly):`);
  sections.push(`Title: ${context.persona.title}`);
  sections.push(`Modifiers: ${context.persona.modifiers}`);
  sections.push(`Emotional posture: ${context.persona.emotionalPosture}`);
  sections.push(`Tooling bias: ${context.persona.toolingBias}`);
  sections.push(`OpenTelemetry familiarity: ${context.persona.otelFamiliarity}`);

  if (context.persona.behaviorBrief) {
    sections.push(`\nHOW YOU COME ACROSS\n${context.persona.behaviorBrief}`);
  }

  if (context.persona.isBuyer) {
    sections.push(
      `\nYOUR VANTAGE POINT
You are senior enough that you are not the one doing the hands-on work. You hear about
problems through your teams, your own metrics, and what customers escalate. Talk about
consequence - delivery, cost, risk, people burning out - rather than narrating commands you
personally ran.`
    );
  }

  if (context.persona.painPoints?.length) {
    // Rendered as private inventory in the attendee's own words, most central first.
    // Explicitly NOT a checklist: reciting these is the scripted behavior the simulator is
    // meant to train against, and volunteering them unprompted breaks the earn-it rule.
    sections.push(
      `\nWHAT ACTUALLY BOTHERS YOU (private - yours, in your words)
${context.persona.painPoints.map((pain) => `- ${pain}`).join("\n")}

These are the things you would complain about if someone got you talking. Do not list them,
do not work through them in order, and do not raise one unprompted. When a question genuinely
lands on one, answer from it - with the specifics of your own situation, not this phrasing.
Anything not on this list is not your problem; do not borrow someone else's complaints.`
    );
  }

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
    persona: {
      title: parsed["Persona"] || "Unknown",
      modifiers: parsed["Modifiers"] || "None",
      emotionalPosture: parsed["Emotional posture"] || "Neutral",
      toolingBias: parsed["Tooling bias"] || "None specified",
      otelFamiliarity: parsed["OpenTelemetry familiarity"] || "Unknown",
    },
    enrichment: enrichment || null,
    sessionState: currentState,
    trainerGuidance: null,
  };
}
