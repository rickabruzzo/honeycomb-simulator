/**
 * Simulator configuration utilities.
 *
 * Provides functions to load and render the simulator.config.json file
 * into structured text suitable for inclusion in system prompts.
 */

import SIMULATOR_CONFIG from "./simulator.config.json";

export { SIMULATOR_CONFIG };

/**
 * Renders simulator rules from config into concise, bullet-formatted text
 * suitable for inclusion in a system prompt.
 *
 * This function transforms the structured JSON config into a compact,
 * readable format that the LLM can easily parse and follow.
 *
 * @param config - The simulator configuration object
 * @returns Formatted rules text
 */
export function renderSimulatorRules(
  config: typeof SIMULATOR_CONFIG = SIMULATOR_CONFIG
): string {
  const sections: string[] = [];

  // Conversation rules
  if (config.conversation_rules) {
    const rules = config.conversation_rules;
    sections.push(`CONVERSATION RULES:
• State is controlled by the app (not by you)
• Reveal information only when earned through good questions
• Do not volunteer pain points unprompted
• Do not disclose persona attributes or OTel level directly`);
  }

  // Keyword restrictions
  if (config.keyword_restrictions?.banned_product_keywords) {
    const keywords = config.keyword_restrictions.banned_product_keywords;
    sections.push(`BANNED PRODUCT KEYWORDS (do not use unless trainee introduces them first):
${keywords.map((k) => `• ${k}`).join("\n")}`);
  }

  // OTel behavior
  if (config.otel_behavior) {
    const levels = config.otel_behavior.levels?.join(", ") || "various levels";
    sections.push(`OPENTELEMETRY BEHAVIOR:
• Never assume the attendee's OTel familiarity level
• Correct the trainee if they make incorrect assumptions
• Possible OTel levels: ${levels}`);
  }

  // Frontend observability rules
  if (config.frontend_observability_rules) {
    sections.push(`FRONTEND OBSERVABILITY:
• Only discuss if asked about user experience or if "backend fine but users mad"
• Keep discussion high-level unless trainee requests expert handoff
• Deep dive requires explicit handoff to frontend expert`);
  }

  // Failure modes
  if (config.failure_modes) {
    const modes = Object.entries(config.failure_modes)
      .map(([trigger, consequence]) => `• ${trigger} → ${consequence}`)
      .join("\n");
    sections.push(`FAILURE MODES (behaviors that cause disengagement):
${modes}`);
  }

  return sections.join("\n\n");
}

/**
 * Renders state-specific behavior guidelines for the current conversation state.
 *
 * This extracts and formats the behavior rules for a specific state
 * (e.g., ICEBREAKER, EXPLORATION) to be injected into the runtime prompt.
 *
 * @param state - Current conversation state
 * @param config - The simulator configuration object
 * @returns Formatted state behavior text
 */
export function renderStateBehavior(
  state: string,
  config: typeof SIMULATOR_CONFIG = SIMULATOR_CONFIG
): string {
  const stateConfig = config.states?.[state as keyof typeof config.states];

  if (!stateConfig) {
    return `CURRENT STATE: ${state}\n(No specific behavior guidelines defined)`;
  }

  const description = stateConfig.description || "No description available";
  const behavior = "attendee_behavior" in stateConfig ? stateConfig.attendee_behavior : [];
  const advanceWhen = "advance_when" in stateConfig ? stateConfig.advance_when : [];
  const blockWhen = "block_when" in stateConfig ? stateConfig.block_when : [];

  const sections: string[] = [];

  sections.push(`CURRENT STATE: ${state}`);
  sections.push(`Description: ${description}`);

  if (behavior.length > 0) {
    sections.push(`Your behavior: ${behavior.join(", ")}`);
  }

  if (advanceWhen.length > 0) {
    sections.push(`State advances when: ${advanceWhen.join(", ")}`);
  }

  if (blockWhen.length > 0) {
    sections.push(`State blocked by: ${blockWhen.join(", ")}`);
  }

  if ("venting_enabled" in stateConfig && stateConfig.venting_enabled) {
    sections.push(`Venting enabled: You may share war stories if trainee shows empathy`);
  }

  if ("possible_outcomes" in stateConfig && stateConfig.possible_outcomes) {
    sections.push(`Possible outcomes: ${stateConfig.possible_outcomes.join(", ")}`);
  }

  return sections.join("\n");
}

/**
 * Gets the full list of banned product keywords.
 *
 * Helper function for easy access to the keyword restriction list.
 *
 * @param config - The simulator configuration object
 * @returns Array of banned keywords
 */
export function getBannedKeywords(
  config: typeof SIMULATOR_CONFIG = SIMULATOR_CONFIG
): string[] {
  return config.keyword_restrictions?.banned_product_keywords || [];
}
