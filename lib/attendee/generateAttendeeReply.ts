/**
 * Main attendee response generation engine.
 *
 * NEW PRIORITY ORDER (persona-first approach):
 * 1. Early-turn pain surfacing (turns 1-3) as STATEMENTS
 * 2. Check persona.questionBank (contextual keyword match)
 * 3. Check persona.painAnchors (surface primary pains, 2+ keyword matches)
 * 4. Check persona.objectionBank (when trainee suggests change/rollout/cost)
 * 5. Template/intent fallback (with persona-specific tool stacks)
 * 6. LLM fallback with strict persona contract
 *
 * All responses are checked for banned phrases before returning.
 */

import { SessionState } from "../storage";
import { classifyAttendeeIntent } from "./intentClassifier";
import { AttendeeIntent } from "./intentTypes";
import { TEMPLATES, getPersonaToolStack } from "./templates";
import { pickVariant } from "./variantPicker";
import { postProcessAttendeeText } from "./postProcess";
import { containsBannedPhrase, sanitizeResponse } from "./bannedPhraseFilter";
import type { Persona } from "../scenarioTypes";

export interface AttendeeReplyResult {
  text: string;
  source:
    | "early_pain_anchor"
    | "persona_question"
    | "persona_pain"
    | "persona_objection"
    | "template"
    | "llm"
    | "banned_phrase_fallback";
  intent?: string;
  confidence?: number;
}

/**
 * Check if candidate response is too similar to recent attendee messages
 *
 * Prevents loop where attendee repeats the exact same question indefinitely.
 */
function isRepetitiveResponse(
  candidateText: string,
  session: SessionState
): boolean {
  // Get last 3 attendee messages
  const recentAttendeeMessages = session.transcript
    .filter((m) => m.type === "attendee")
    .slice(-3)
    .map((m) => m.text.toLowerCase().trim());

  if (recentAttendeeMessages.length === 0) {
    return false;
  }

  const candidateLower = candidateText.toLowerCase().trim();

  // Check for exact match
  if (recentAttendeeMessages.includes(candidateLower)) {
    return true;
  }

  // Check for near-identical match (> 90% similarity)
  for (const recentMsg of recentAttendeeMessages) {
    const longerLength = Math.max(candidateLower.length, recentMsg.length);
    const shorterLength = Math.min(candidateLower.length, recentMsg.length);

    // If one is a substring of the other and they're similar length
    if (
      (candidateLower.includes(recentMsg) || recentMsg.includes(candidateLower)) &&
      shorterLength / longerLength > 0.9
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Get a wrap-up CTA question to break out of loops
 *
 * Returns a "next step" style question that doesn't repeat recent output.
 */
function getWrapUpQuestion(persona: Persona, session: SessionState): string {
  const wrapUpOptions = [
    "Is there a free tier we could try?",
    "Do you have documentation I can review?",
    "Can you scan my badge for follow-up?",
    "What's the pricing model?",
    "Can you show me a quick demo?",
    "How hard is the rollout? We're pretty lean on bandwidth.",
  ];

  // Filter out any that were recently used
  const recentText = session.transcript
    .filter((m) => m.type === "attendee")
    .slice(-5)
    .map((m) => m.text.toLowerCase())
    .join(" ");

  const unused = wrapUpOptions.filter(
    (q) => !recentText.includes(q.toLowerCase())
  );

  if (unused.length > 0) {
    return unused[0];
  }

  // Fallback: pick a random one
  return wrapUpOptions[Math.floor(Math.random() * wrapUpOptions.length)];
}

/**
 * Convert pain question to declarative statement
 *
 * Examples:
 * - "How do I minimize on-call pain?" → "We're dealing with a lot of on-call pain."
 * - "How quickly can we debug?" → "We need to debug issues faster."
 * - "How do I balance scaling needs with reliability?" → "It's hard to balance scaling with our reliability targets."
 */
function formatPainAsStatement(pain: string): string {
  // Common pain question patterns → statements
  const patterns = [
    {
      pattern: /^how do (?:I|we) minimize (.+)\?$/i,
      replacement: "We're dealing with a lot of $1.",
    },
    {
      pattern: /^how (?:quickly|fast) can (?:we|I) (.+)\?$/i,
      replacement: "We need to $1 faster.",
    },
    {
      pattern: /^how do (?:I|we) (.+)\?$/i,
      replacement: "It's hard to $1.",
    },
    {
      pattern: /^do(?:es)? (.+)\?$/i,
      replacement: "We're not sure if $1.",
    },
  ];

  let statement = pain;
  for (const { pattern, replacement } of patterns) {
    if (pattern.test(statement)) {
      statement = statement.replace(pattern, replacement);
      break;
    }
  }

  // If no pattern matched, try a generic conversion
  if (statement === pain && pain.startsWith("How ")) {
    statement = pain
      .replace(/^How /, "We need to figure out how to ")
      .replace(/\?$/, ".");
  }

  return statement;
}

/**
 * Check if this pain has already been surfaced in the conversation
 */
function hasAlreadySurfacedPain(
  session: SessionState,
  pain: { id: string }
): boolean {
  // Check if pain ID is in session's expressed intents or pain tracking
  const surfacedPains = (session as any).surfacedPainIds || [];
  return surfacedPains.includes(pain.id);
}

/**
 * Mark pain as surfaced in session
 */
function markPainAsSurfaced(session: SessionState, painId: string): void {
  if (!(session as any).surfacedPainIds) {
    (session as any).surfacedPainIds = [];
  }
  (session as any).surfacedPainIds.push(painId);
}

/**
 * Match persona question based on keywords
 */
function matchPersonaQuestion(
  traineeText: string,
  persona: Persona
): { question: string; category: string } | null {
  if (!persona.questionBank || persona.questionBank.length === 0) {
    return null;
  }

  const lowerText = traineeText.toLowerCase();
  const words = lowerText.split(/\s+/);

  // Find questions with keyword matches
  const matches = persona.questionBank
    .map((q) => {
      // Extract keywords from triggerContext or question itself
      const contextWords = q.triggerContext?.toLowerCase().split(/\s+/) || [];
      const questionWords = q.question.toLowerCase().split(/\s+/);
      const allKeywords = [...contextWords, ...questionWords];

      // Count how many keywords appear in trainee text
      const matchCount = allKeywords.filter((kw) =>
        words.some((w) => w.includes(kw) || kw.includes(w))
      ).length;

      return { question: q, matchCount };
    })
    .filter((m) => m.matchCount >= 2); // Require at least 2 keyword matches

  if (matches.length === 0) {
    return null;
  }

  // Select best match (highest keyword count)
  matches.sort((a, b) => b.matchCount - a.matchCount);
  const selected = matches[0].question;

  return {
    question: selected.question,
    category: selected.category,
  };
}

/**
 * Match persona pain anchor based on keywords
 */
function matchPersonaPain(
  traineeText: string,
  persona: Persona
): { pain: string; painId: string; priority: string } | null {
  if (!persona.painAnchors || persona.painAnchors.length === 0) {
    return null;
  }

  const lowerText = traineeText.toLowerCase();

  // Find pain anchors with keyword matches
  const matches = persona.painAnchors
    .map((p) => {
      // Count how many keywords appear in trainee text
      const matchCount = p.keywords.filter((kw) =>
        lowerText.includes(kw.toLowerCase())
      ).length;

      return { pain: p, matchCount };
    })
    .filter((m) => m.matchCount >= 2); // Require at least 2 keyword matches

  if (matches.length === 0) {
    return null;
  }

  // Prioritize primary pains over secondary
  const primaryMatches = matches.filter((m) => m.pain.priority === "primary");
  const selectedMatches = primaryMatches.length > 0 ? primaryMatches : matches;

  // Select best match (highest keyword count)
  selectedMatches.sort((a, b) => b.matchCount - a.matchCount);
  const selected = selectedMatches[0].pain;

  return {
    pain: selected.pain,
    painId: selected.id,
    priority: selected.priority,
  };
}

/**
 * Match persona objection based on trainee text suggesting change/rollout/cost
 */
function matchPersonaObjection(
  traineeText: string,
  persona: Persona
): { objection: string; type: string } | null {
  if (!persona.objectionBank || persona.objectionBank.length === 0) {
    return null;
  }

  const lowerText = traineeText.toLowerCase();

  // Detect if trainee is suggesting change/adoption/rollout
  const suggestionPatterns = [
    /should we|could we|would you|let'?s|how about|what if/i,
    /adopt|switch|migrate|roll out|implement|try|use/i,
    /cost|price|budget|expensive/i,
    /effort|work|time|difficult|hard/i,
  ];

  const isSuggestion = suggestionPatterns.some((pattern) =>
    pattern.test(traineeText)
  );

  if (!isSuggestion) {
    return null;
  }

  // Find matching objections by type
  let matchingType: string | null = null;

  if (/cost|price|budget|expensive/i.test(lowerText)) {
    matchingType = "cost";
  } else if (/effort|work|time|difficult|hard/i.test(lowerText)) {
    matchingType = "effort";
  } else if (/technical|integrate|compatible|work with/i.test(lowerText)) {
    matchingType = "technical";
  } else if (/timing|when|schedule|ready/i.test(lowerText)) {
    matchingType = "timing";
  } else if (/proof|evidence|case study|reference/i.test(lowerText)) {
    matchingType = "proof";
  }

  if (!matchingType) {
    return null;
  }

  const matchingObjections = persona.objectionBank.filter(
    (o) => o.type === matchingType
  );

  if (matchingObjections.length === 0) {
    // Fall back to any objection
    const randomObjection =
      persona.objectionBank[
        Math.floor(Math.random() * persona.objectionBank.length)
      ];
    return {
      objection: randomObjection.objection,
      type: randomObjection.type,
    };
  }

  const selected =
    matchingObjections[Math.floor(Math.random() * matchingObjections.length)];
  return {
    objection: selected.objection,
    type: selected.type,
  };
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
 * Generate attendee reply using persona-first approach with template/LLM fallback.
 *
 * LOOP PREVENTION: Detects repeated attendee output and forces diversity.
 */
function generateAttendeeReplyInternal(params: {
  traineeText: string;
  session: SessionState;
  traineeTurnCount: number;
}): AttendeeReplyResult | null {
  const { traineeText, session, traineeTurnCount } = params;

  // Get persona object (should be full Persona, not just string)
  const persona = (session as any).persona as Persona | undefined;

  // 1. EARLY-TURN PAIN SURFACING (turns 1-3) as STATEMENTS
  if (traineeTurnCount <= 3 && persona?.painAnchors) {
    const primaryPains = persona.painAnchors.filter(
      (p) => p.priority === "primary"
    );

    if (primaryPains.length > 0) {
      // Find unsurfaced primary pains
      const unsurfacedPains = primaryPains.filter(
        (p) => !hasAlreadySurfacedPain(session, p)
      );

      if (unsurfacedPains.length > 0) {
        // Select random unsurfaced pain
        const selectedPain =
          unsurfacedPains[Math.floor(Math.random() * unsurfacedPains.length)];

        // Mark as surfaced
        markPainAsSurfaced(session, selectedPain.id);

        // Format as statement
        const statement = formatPainAsStatement(selectedPain.pain);

        // Sanitize for banned phrases (should not trigger, but safety check)
        const sanitized = sanitizeResponse(statement, persona);

        return {
          text: postProcessAttendeeText(sanitized, persona),
          source: "early_pain_anchor",
          confidence: 1.0,
        };
      }
    }
  }

  // 2. CHECK PERSONA QUESTION BANK (contextual keyword match)
  if (persona?.questionBank) {
    const matchedQuestion = matchPersonaQuestion(traineeText, persona);

    if (matchedQuestion) {
      const sanitized = sanitizeResponse(matchedQuestion.question, persona);

      return {
        text: postProcessAttendeeText(sanitized, persona),
        source: "persona_question",
        confidence: 0.9,
      };
    }
  }

  // 3. CHECK PERSONA PAIN ANCHORS (2+ keyword matches)
  if (persona?.painAnchors) {
    const matchedPain = matchPersonaPain(traineeText, persona);

    if (matchedPain && !hasAlreadySurfacedPain(session, { id: matchedPain.painId })) {
      // Mark as surfaced
      markPainAsSurfaced(session, matchedPain.painId);

      // Format as statement
      const statement = formatPainAsStatement(matchedPain.pain);
      const sanitized = sanitizeResponse(statement, persona);

      return {
        text: postProcessAttendeeText(sanitized, persona),
        source: "persona_pain",
        confidence: 0.85,
      };
    }
  }

  // 4. CHECK PERSONA OBJECTION BANK
  if (persona?.objectionBank) {
    const matchedObjection = matchPersonaObjection(traineeText, persona);

    if (matchedObjection) {
      const sanitized = sanitizeResponse(matchedObjection.objection, persona);

      return {
        text: postProcessAttendeeText(sanitized, persona),
        source: "persona_objection",
        confidence: 0.85,
      };
    }
  }

  // 5. TEMPLATE/INTENT FALLBACK (with persona-specific tool stacks)
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

  // If not exhausted and confidence is good, use template
  if (!intentResult.exhausted && intentResult.confidence >= 0.7) {
    const template = TEMPLATES[intentResult.intent];

    if (template && template.variants.length > 0) {
      // Prepare template slots with persona-specific tool stack
      const slots: {
        tool1?: string;
        tool2?: string;
        stack?: string;
        pain?: string;
        timeframe?: string;
        customerImpactPhrase?: string;
      } = {};

      // Get tool stack from persona or establish default
      if (persona) {
        const toolStack = getPersonaToolStack(persona);
        slots.tool1 = toolStack.tool1;
        slots.tool2 = toolStack.tool2;
        slots.stack = toolStack.stack;

        // Store in session for consistency
        if (!session.toolingContext) {
          session.toolingContext = {
            apm: toolStack.tool1,
            logs: toolStack.tool2,
            stack: toolStack.stack,
          };
        }
      } else {
        // Legacy fallback
        if (!session.toolingContext) {
          session.toolingContext = {
            apm: "New Relic",
            logs: "Splunk",
            stack: "a mix of legacy APM tools",
          };
        }
        slots.tool1 = session.toolingContext.apm;
        slots.tool2 = session.toolingContext.logs;
        slots.stack = session.toolingContext.stack;
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

      // Sanitize for banned phrases
      const sanitized = persona
        ? sanitizeResponse(filledTemplate, persona)
        : filledTemplate;

      // Post-process
      const finalText = postProcessAttendeeText(sanitized, persona);

      // Check if sanitization replaced with fallback
      const source =
        sanitized !== filledTemplate && persona
          ? "banned_phrase_fallback"
          : "template";

      return {
        text: finalText,
        source: source as any,
        intent: intentResult.intent,
        confidence: intentResult.confidence,
      };
    }
  }

  // 6. LLM FALLBACK - Return null to trigger LLM in caller
  // (LLM fallback will be constrained by persona contract in the caller)
  return null;
}

/**
 * Public wrapper with loop detection
 *
 * Prevents attendee from repeating the exact same question indefinitely.
 */
export function generateAttendeeReply(params: {
  traineeText: string;
  session: SessionState;
  traineeTurnCount: number;
}): AttendeeReplyResult | null {
  const { session } = params;
  const persona = (session as any).persona as Persona | undefined;

  // Generate initial response
  let result = generateAttendeeReplyInternal(params);

  // If result is null (LLM fallback), return null
  if (!result) {
    return null;
  }

  // LOOP DETECTION: If response is repetitive, force a different question
  if (isRepetitiveResponse(result.text, session)) {
    console.log(
      `[Loop Detection] Repetitive response detected: "${result.text.substring(0, 50)}..."`
    );
    console.log("[Loop Detection] Forcing wrap-up question to break loop");

    // Force a wrap-up question
    const wrapUpQuestion = persona
      ? getWrapUpQuestion(persona, session)
      : "Can you show me how this works?";

    return {
      text: postProcessAttendeeText(wrapUpQuestion, persona),
      source: "persona_question",
      confidence: 0.95,
    };
  }

  return result;
}
