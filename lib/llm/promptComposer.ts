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
import { renderLengthDirective } from "../attendee/lengthBudget";
import { getRevealBudget } from "../attendee/revealBudget";
import type { MomentumBand } from "../attendee/momentumBands";

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

  // 5b. Why you walked up — booth-realistic curiosity. A real attendee wanders to the booth out
  //     of curiosity (or the swag) and has a few plain questions on their mind. This is separate
  //     from their pain (which stays earned-only); asking a product question is curiosity, not
  //     venting. It also puts the greeter's real job on the table: answer common questions at a
  //     high level, and hand off the deep-dive.
  sections.push(buildCuriosityBlock(context));

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

  // 8b. Reveal budget: how open the attendee is on this turn, derived from BOTH the phase
  //      (what is on the table) and the earned-trust band (what the trainee has earned). This
  //      is what makes listening pay off - a steamrolled attendee stays short even in pain
  //      discovery, and only a listened-to one unlocks the war story.
  const band = (context.momentumBand ?? "GUARDED") as MomentumBand;
  const reveal = getRevealBudget(context.sessionState, band);
  sections.push(`\n${reveal.opennessDirective}`);
  sections.push(`\n${renderLengthDirective(reveal.lengthBudget)}`);

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
 * Build the "why you walked up" curiosity block.
 *
 * A booth attendee is not a discovery subject waiting to be interviewed — they wandered over with
 * genuine curiosity and a few plain questions of their own. Surfacing those questions makes the
 * attendee feel like a real walk-up AND exercises the greeter's core job: answer common questions
 * at a high level, and hand off the deep-dive. The question set is the common booth FAQ, lightly
 * tailored to what THIS attendee would actually wonder given their tools and OTel familiarity.
 */
function buildCuriosityBlock(context: PromptRuntimeContext): string {
  const otel = (context.persona.otelFamiliarity || "").toLowerCase();
  // An active/experienced OTel user wouldn't ask "what is OpenTelemetry"; a less-familiar one might.
  const otelCurious =
    otel.includes("never") || otel.includes("aware") || otel.includes("considering");

  const questions: string[] = [
    `"So what is Honeycomb, exactly — what does it actually do?"`,
    `"How are you different from what we already use?" (you'd compare against your own tools — see your tooling bias above)`,
    `"Isn't this just observability / APM / logging? What's the real difference?"`,
    `"Does it handle metrics and logs too, or just traces?"`,
    `"How would this actually help me find problems faster?"`,
    `"What does it cost — especially compared to what we pay now?"`,
  ];
  if (otelCurious) {
    questions.push(
      `"Where does OpenTelemetry fit — do I have to be all-in on it first?"`
    );
  }

  return `WHY YOU WALKED UP TO THIS BOOTH
You are a real conference attendee at the Honeycomb booth. You wandered over out of curiosity —
maybe for the swag, maybe because you've heard the name "Honeycomb" or the word "observability"
going around the floor. You are not here to be sold to; you're poking around to see whether it's
worth your time.

Like anyone at a booth, you have a few plain questions on your mind. Over the conversation you may
naturally ask ONE OR TWO of these — in your own words, when it fits the flow — NOT as a list, never
all of them, and not every turn. Ask the way a curious person orients, not the way an interviewer
runs a script:
${questions.map((q) => `  - ${q}`).join("\n")}

These are CURIOSITY, not complaints. Asking one does NOT count as volunteering your pain, and it
does not require the staffer to have earned anything — a curious person asks. Whether you then OPEN
UP about your real frustrations still depends entirely on whether they actually listen.

And notice how they handle your question. A booth greeter is not expected to be the deep technical
or pricing expert. If they give you a clear, honest, high-level answer — or offer to connect you
with an expert for the details — that's exactly right and it builds your trust. If they instead
wade deep into implementation, rollout mechanics, or exact contract numbers themselves, a real
attendee like you would rather just get the short version or the offer of the right expert.`;
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
