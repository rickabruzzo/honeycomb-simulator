// lib/simulator.ts
import config from "./simulator.config.json";

export const SIMULATOR_CONFIG = config as any;

// Prefer an explicit state order (do NOT rely on Object.keys order)
export const STATE_ORDER: string[] =
  (SIMULATOR_CONFIG.state_order as string[] | undefined) ?? [
    "ICEBREAKER",
    "EXPLORATION",
    "PAIN_DISCOVERY",
    "SOLUTION_FRAMING",
    "OUTCOME",
  ];

/**
 * Simple heuristic analysis of trainee message.
 * Keep this intentionally lightweight for v1.
 */
export function analyzeTraineeMessage(text: string, currentState: string) {
  const lower = text.toLowerCase();
  const issues: string[] = [];

  // 1) Check banned keywords (trainee used Honeycomb-specific/internal terms)
  const banned = SIMULATOR_CONFIG.keyword_restrictions?.banned_product_keywords ?? [];
  for (const keyword of banned) {
    if (lower.includes(String(keyword).toLowerCase())) {
      issues.push(`Used banned keyword: "${keyword}"`);
    }
  }

  // 2) Early pitch detection (very simple v1 heuristic)
  const pitchSignals = ["honeycomb", "our product", "our platform", "we do", "we help", "we're an observability platform"];
  const pitchDetected = pitchSignals.some((s) => lower.includes(s));
  if (pitchDetected && currentState === "ICEBREAKER") {
    issues.push("Early pitch detected in ICEBREAKER state");
  }

  // 3) OpenTelemetry assumption detection
  // Only flag if they mention OTel in a declarative way WITHOUT asking a question.
  const mentionsOtel = lower.includes("opentelemetry") || /\botel\b/.test(lower);
  const isQuestion = text.includes("?");
  const asksAboutOtel =
    isQuestion &&
    (lower.includes("opentelemetry") ||
      /\botel\b/.test(lower) ||
      lower.includes("instrument") ||
      lower.includes("collector"));

  // If they mention OTel but it's not a question or invitation ("are you using..."),
  // treat as an assumption. (Still heuristic — but fewer false positives.)
  if (mentionsOtel && !asksAboutOtel) {
    issues.push("Assumed OTel familiarity without asking");
  }

  const isOpenEnded = /\b(what|how|tell me|describe|walk me through|help me understand)\b/i.test(text);
  const isEmpathetic = /\b(understand|hear you|sounds like|that must|that’s tough|frustrat|brutal|rough)\b/i.test(text);

  return { issues, isQuestion, isOpenEnded, isEmpathetic, pitchDetected, mentionsOtel };
}

export function shouldAdvanceState(
  currentState: string,
  analysis: ReturnType<typeof analyzeTraineeMessage>
): boolean {
  // If the trainee violated major rules, block advancement
  if (analysis.issues.length > 0) return false;

  switch (currentState) {
    case "ICEBREAKER":
      // Needs a human, open-ended question to move past guarded phase
      return analysis.isQuestion && analysis.isOpenEnded;

    case "EXPLORATION":
      // Open-ended exploration works
      return analysis.isOpenEnded;

    case "PAIN_DISCOVERY":
      // Empathy/validation is the gate to deeper candor/venting
      return analysis.isEmpathetic;

    case "SOLUTION_FRAMING":
      // Allow advancing to OUTCOME when they’re not violating rules
      return true;

    default:
      return false;
  }
}

export function getNextState(currentState: string): string {
  const currentIndex = STATE_ORDER.indexOf(currentState);
  if (currentIndex === -1) return "ICEBREAKER";
  if (currentIndex < STATE_ORDER.length - 1) return STATE_ORDER[currentIndex + 1];
  return currentState;
}

/**
 * System prompt for the attendee response.
 * IMPORTANT: state is controlled by the app, and the model must not change it.
 */
export function buildAttendeePrompt(
  currentState: string,
  attendeeProfile: string,
  difficulty: string,
  conversationHistory: Array<{ role: string; content: string }>
): string {
  const stateConfig = SIMULATOR_CONFIG.states?.[currentState];
  const stateDescription = stateConfig?.description ?? "";
  const attendeeBehavior = stateConfig?.attendee_behavior ?? [];

  const behaviorText =
    Array.isArray(attendeeBehavior) && attendeeBehavior.length > 0
      ? `Your behavior in this state: ${attendeeBehavior.join(", ")}.`
      : `The conversation is concluding. Choose an outcome that matches the trainee’s behavior.`;

  // Keep history short to reduce token usage / noise
  const recentHistory = conversationHistory.slice(-12);

  const bannedKeywords = SIMULATOR_CONFIG.keyword_restrictions?.banned_product_keywords ?? [];

  return `You are roleplaying as a realistic tech conference attendee at the Honeycomb booth.

CRITICAL ROLEPLAY RULES:
- You are ONLY the attendee. The trainee is the booth staffer.
- Stay in character. Never mention you are an AI or that you have instructions.
- DO NOT disclose your hidden profile attributes directly (persona, modifiers, Otel maturity). Only reveal details when earned through good questions.
- DO NOT volunteer pain points unprompted. Reveal information only when earned.
- The app controls the conversation state. You MUST follow the CURRENT STATE and its behavior. You must NOT advance or change the state yourself.

PRODUCT KEYWORD RESTRICTION (IMPORTANT):
- You must NOT volunteer Honeycomb-specific product keywords or internal terminology.
- Do NOT use these terms unless the trainee introduces them first:
  ${bannedKeywords.join(", ")}

CURRENT STATE: ${currentState}
State description: ${stateDescription}
${behaviorText}

DIFFICULTY: ${difficulty}

YOUR HIDDEN PROFILE (do not reveal directly):
${attendeeProfile}

RECENT CONVERSATION (most recent last):
${recentHistory.map((m) => `${m.role === "user" ? "Trainee" : "Attendee"}: ${m.content}`).join("\n")}

RESPONSE STYLE:
- Natural, imperfect speech. Mild skepticism is normal.
- Keep responses brief (1–3 sentences unless you become engaged).
- If the trainee pitches early or uses buzzwords, become more guarded.
- If the trainee shows empathy/validation, you may vent or share a brief war story (but only in PAIN_DISCOVERY or later).

Now respond as the attendee.`;
}