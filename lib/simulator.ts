// lib/simulator.ts
import config from "./simulator.config.json";
import type { EnrichmentResult } from "./llm/enrichmentTypes";

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
 * PRNG utilities for deterministic persona-aware outcome variance.
 * Uses seeded randomness to ensure consistent outcomes across same conversations.
 */

/**
 * Simple hash function to convert seed string to numeric seed.
 * Uses djb2 algorithm for stable, deterministic hashing.
 */
export function hashSeed(seed: string): number {
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 33) ^ seed.charCodeAt(i);
  }
  return Math.abs(hash);
}

/**
 * Seeded pseudo-random number generator.
 * Returns a deterministic random number in [0, 1) for a given seed.
 */
export function seededRandom(seed: number): number {
  // Linear congruential generator (LCG) with standard parameters
  const a = 1664525;
  const c = 1013904223;
  const m = Math.pow(2, 32);

  const next = (a * seed + c) % m;
  return next / m;
}

/**
 * Apply tolerance jitter to outcome weights.
 * Adds random variance within ±tolerance to each weight, then normalizes.
 *
 * @param weights - Base weights object { DEMO_READY: 0.6, ... }
 * @param tolerance - Jitter range (e.g., 0.10 = ±10%)
 * @param seed - Numeric seed for deterministic jitter
 * @returns Jittered and normalized weights
 */
export function jitterWeights(
  weights: Record<string, number>,
  tolerance: number,
  seed: number
): Record<string, number> {
  const jittered: Record<string, number> = {};
  let total = 0;

  // Apply jitter to each weight
  Object.entries(weights).forEach(([outcome, weight], index) => {
    // Use offset seed for each outcome to get different random values
    const offsetSeed = seed + index * 12345;
    const random = seededRandom(offsetSeed);

    // Map random [0,1) to [-tolerance, +tolerance]
    const jitter = (random * 2 - 1) * tolerance;
    const jitteredWeight = Math.max(0, weight + jitter);

    jittered[outcome] = jitteredWeight;
    total += jitteredWeight;
  });

  // Normalize to sum to 1.0
  if (total > 0) {
    Object.keys(jittered).forEach((outcome) => {
      jittered[outcome] /= total;
    });
  }

  return jittered;
}

/**
 * Sample an outcome from weighted probabilities using seeded randomness.
 *
 * @param weights - Normalized weights { DEMO_READY: 0.6, ... }
 * @param seed - Numeric seed for deterministic selection
 * @returns Selected outcome string
 */
export function sampleOutcome(
  weights: Record<string, number>,
  seed: number
): string {
  const random = seededRandom(seed);
  let cumulative = 0;

  for (const [outcome, weight] of Object.entries(weights)) {
    cumulative += weight;
    if (random < cumulative) {
      return outcome;
    }
  }

  // Fallback to last outcome if rounding causes issues
  const outcomes = Object.keys(weights);
  return outcomes[outcomes.length - 1];
}

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

  // 2) Early pitch detection - ONLY flag unsolicited feature dumps, not booth-appropriate framing
  // Allow: "What Honeycomb is", "We help with observability", "We're an observability platform"
  // Flag: Multiple features listed, pricing push, demo push, competitor bashing
  const isQuestion = text.includes("?");
  const featureDumpSignals = [
    /\b(bubbleup|high.cardinality|wide events|service map)\b/i,
    /unlike (datadog|splunk|newrelic)/i,
    /better than/i,
  ];
  const hasFeatureDump = featureDumpSignals.some((pattern) => pattern.test(text));
  const hasPricingPush = /\b(pricing|cost|budget|save money|roi)\b/i.test(lower) && currentState === "ICEBREAKER";
  const hasDemoPush = /\b(let me show|demo|walk you through)\b/i.test(lower) && currentState === "ICEBREAKER" && !isQuestion;

  if ((hasFeatureDump || hasPricingPush || hasDemoPush) && currentState === "ICEBREAKER") {
    issues.push("Early pitch detected in ICEBREAKER state");
  }

  // 3) OpenTelemetry assumption detection
  // ONLY flag if they ASSERT OTel usage without asking OR receiving confirmation first
  // Allow: "Are you using OTel?", "Do you have OTel?", "Have you heard of OTel?"
  // Flag: "Since you're using OTel...", "With your OTel setup..."
  const mentionsOtel = lower.includes("opentelemetry") || /\botel\b/.test(lower);
  const asksAboutOtel =
    isQuestion &&
    (lower.includes("are you") ||
      lower.includes("do you") ||
      lower.includes("have you") ||
      lower.includes("familiar with")) &&
    mentionsOtel;
  const assertsOtel =
    (lower.includes("since you") ||
     lower.includes("with your") ||
     lower.includes("your otel") ||
     lower.includes("you're using")) &&
    mentionsOtel;

  // Only flag if asserting without asking
  if (assertsOtel && !asksAboutOtel) {
    issues.push("Assumed OTel familiarity without asking");
  }

  const isOpenEnded = /\b(what|how|tell me|describe|walk me through|help me understand)\b/i.test(text);
  const isEmpathetic = /\b(understand|hear you|sounds like|that must|that's tough|frustrat|brutal|rough)\b/i.test(text);

  return { issues, isQuestion, isOpenEnded, isEmpathetic, mentionsOtel };
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
 * Gate OUTCOME state entry on explicit attendee commitment.
 * SOLUTION_FRAMING cannot advance to OUTCOME unless attendee commits to a next step.
 *
 * @param committedOutcome - Detected commitment outcome (or null)
 * @returns true if should enter OUTCOME state
 */
export function shouldEnterOutcomeState(params: {
  committedOutcome: string | null;
}): boolean {
  return params.committedOutcome !== null;
}

/**
 * Check if conversation has exceeded turn limit for the given difficulty.
 * Turns are counted as trainee messages only (not system or attendee).
 *
 * @param turnCount - Number of trainee messages sent
 * @param difficulty - easy, medium, or hard
 * @returns true if limit exceeded
 */
export function hasExceededTurnLimit(turnCount: number, difficulty?: string): boolean {
  const limits = SIMULATOR_CONFIG.conversation_rules?.turn_limits || {
    easy: 10,
    medium: 12,
    hard: 14,
  };

  const limit = limits[(difficulty || "medium") as keyof typeof limits] || limits.medium;
  return turnCount >= limit;
}

/**
 * Detect self-service cues in trainee or attendee messages.
 *
 * @param text - Message text to analyze
 * @returns true if self-service cues detected
 */
export function detectSelfServiceCues(text: string): boolean {
  const normalized = normalizeText(text);
  const cues = SIMULATOR_CONFIG.self_service_cues || [];

  // Exact phrase matching on normalized text
  for (const cue of cues) {
    const normalizedCue = normalizeText(String(cue));
    if (normalized.includes(normalizedCue)) {
      return true;
    }
  }

  // Additional pattern matching
  const patterns = [
    /free tier/i,
    /try.*myself/i,
    /explore.*own/i,
    /no.*urgency/i,
    /not.*buying/i,
    /locked.*vendor/i,
    /rfp.*months/i,
    /documentation/i,
    /self.*service/i,
    /async.*learn/i,
  ];

  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Detect deferred interest cues (interested but timing isn't right).
 *
 * @param text - Message text to analyze
 * @returns true if deferred interest cues detected
 */
export function detectDeferredInterestCues(text: string): boolean {
  const normalized = normalizeText(text);
  const cues = SIMULATOR_CONFIG.deferred_interest_cues || [];

  // Exact phrase matching on normalized text
  for (const cue of cues) {
    const normalizedCue = normalizeText(String(cue));
    if (normalized.includes(normalizedCue)) {
      return true;
    }
  }

  // Additional pattern matching
  const patterns = [
    /\b(later|future|down the road|eventual|someday)\b/i,
    /not\s+(ready|now|yet|urgent)/i,
    /when\s+(we|things)/i,
    /after\s+(we|the|this)/i,
  ];

  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Normalize text for robust pattern matching.
 * - Lowercase
 * - Strip punctuation (except spaces)
 * - Collapse multiple spaces
 *
 * @param text - Text to normalize
 * @returns Normalized text
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
    .replace(/\s+/g, ' ')      // Collapse multiple spaces
    .trim();
}

/**
 * Detect MQL (Marketing Qualified Lead) cues in trainee or attendee messages.
 *
 * MQL requires BOTH:
 * 1. Explicit badge scan request OR sales/pricing follow-up request
 * 2. Near-term intent signals (this quarter, soon, schedule call, etc.)
 *
 * Returns detailed results including matched cues for telemetry and prompt injection.
 *
 * @param text - Message text to analyze
 * @returns Object with detected flag, matched cues, and near-term intent
 */
export function detectMQLCues(text: string): { detected: boolean; matched: string[]; hasNearTermIntent: boolean } {
  const normalized = normalizeText(text);
  const cues = SIMULATOR_CONFIG.mql_cues || [];
  const nearTermSignals = SIMULATOR_CONFIG.mql_near_term_signals || [];
  const matched: string[] = [];

  // Check for explicit MQL cues (badge scan)
  for (const cue of cues) {
    const normalizedCue = normalizeText(String(cue));
    if (normalized.includes(normalizedCue)) {
      matched.push(String(cue));
    }
  }

  // Check for near-term intent signals
  let hasNearTermIntent = false;
  for (const signal of nearTermSignals) {
    const normalizedSignal = normalizeText(String(signal));
    if (normalized.includes(normalizedSignal)) {
      hasNearTermIntent = true;
      matched.push(`near-term: ${signal}`);
      break; // Only need one near-term signal
    }
  }

  // MQL detected ONLY if we have badge scan OR (pricing/sales talk AND near-term intent)
  const hasBadgeScan = matched.some(m => m.toLowerCase().includes('badge'));
  const detected = hasBadgeScan || (hasNearTermIntent && matched.length > 1);

  return {
    detected,
    matched: matched.slice(0, 5), // Truncate for telemetry
    hasNearTermIntent,
  };
}

/**
 * Detect stakeholder type from persona profile and optional transcript signals.
 *
 * Helps determine if attendee is an executive (prefers MQL) or IC without authority.
 * Can analyze both persona profile AND recent conversation for runtime signal detection.
 *
 * @param personaProfile - Persona profile string or title
 * @param transcript - Optional recent transcript text to check for runtime signals
 * @returns "executive" | "ic_without_authority" | "unknown"
 */
export function detectStakeholderType(
  personaProfile: string,
  transcript?: string
): string {
  const normalized = normalizeText(personaProfile);
  const stakeholders = SIMULATOR_CONFIG.stakeholder_types || {};

  // Check executive titles in persona profile
  const executiveTitles = stakeholders.executive?.titles || [];
  for (const title of executiveTitles) {
    const normalizedTitle = normalizeText(String(title));
    if (normalized.includes(normalizedTitle)) {
      return "executive";
    }
  }

  // Check IC titles in persona profile
  const icTitles = stakeholders.ic_without_authority?.titles || [];
  for (const title of icTitles) {
    const normalizedTitle = normalizeText(String(title));
    if (normalized.includes(normalizedTitle)) {
      return "ic_without_authority";
    }
  }

  // If transcript provided, check for runtime IC authority signals
  if (transcript) {
    const normalizedTranscript = normalizeText(transcript);
    const icSignals = stakeholders.ic_without_authority?.signals || [];

    for (const signal of icSignals) {
      const normalizedSignal = normalizeText(String(signal));
      if (normalizedTranscript.includes(normalizedSignal)) {
        return "ic_without_authority";
      }
    }

    // Pattern-based IC authority detection
    const icPatterns = [
      /\b(don\s?t|do\s+not)\s+make\s+(the\s+)?decision/,
      /my\s+(manager|lead|boss|director)/,
      /team\s+lead/,
      /need\s+to\s+(convince|get\s+buy\s?in)/,
      /help\s+me\s+advocate/,
    ];

    for (const pattern of icPatterns) {
      if (pattern.test(normalizedTranscript)) {
        return "ic_without_authority";
      }
    }
  }

  return "unknown";
}

/**
 * Calculate soft demo eligibility score based on conversation signals.
 * Allows DEMO_READY outcome without explicit "demo" keyword when strong signals present.
 *
 * Signals (2+ required for eligibility):
 * - Customer impact discussion
 * - Near-term pressure/urgency
 * - Current tooling context
 * - Effort/complexity addressed
 * - Team/manager evaluation mentioned
 *
 * @param transcript - Recent conversation history (last 5-10 messages)
 * @param mqlResult - MQL detection result
 * @returns Score 0-5 and eligibility flag
 */
export function calculateDemoEligibility(
  transcript: string,
  mqlResult: { detected: boolean; hasNearTermIntent: boolean }
): { score: number; eligible: boolean } {
  const lower = transcript.toLowerCase();
  let score = 0;

  // Signal 1: Customer impact discussion
  const customerImpactPhrases = [
    "customer", "end user", "user experience",
    "customer-facing", "customer impact", "affecting customers",
    "customer problems", "users are", "customer complaints"
  ];
  if (customerImpactPhrases.some(phrase => lower.includes(phrase))) {
    score += 1;
  }

  // Signal 2: Near-term pressure (from MQL detection)
  if (mqlResult.hasNearTermIntent) {
    score += 1;
  }

  // Signal 3: Current tooling context mentioned
  const toolingPhrases = [
    "prometheus", "grafana", "datadog", "splunk", "newrelic",
    "elk", "elasticsearch", "jaeger", "zipkin", "current setup",
    "our stack", "our tools", "we use", "we have"
  ];
  if (toolingPhrases.some(phrase => lower.includes(phrase))) {
    score += 1;
  }

  // Signal 4: Effort/complexity concerns addressed
  const effortPhrases = [
    "overhead", "effort", "setup", "migration", "adoption",
    "how hard", "how long", "easy to", "difficult to",
    "onboarding", "learning curve", "time to value"
  ];
  if (effortPhrases.some(phrase => lower.includes(phrase))) {
    score += 1;
  }

  // Signal 5: Team/manager evaluation mentioned
  const evaluationPhrases = [
    "team", "manager", "leadership", "evaluate", "evaluation",
    "assess", "compare", "options", "looking at", "considering",
    "stakeholder", "buy-in", "advocate"
  ];
  if (evaluationPhrases.some(phrase => lower.includes(phrase))) {
    score += 1;
  }

  return {
    score,
    eligible: score >= 2
  };
}

/**
 * Get persona outcome band configuration for a given persona.
 *
 * @param personaProfile - Attendee profile string containing persona type
 * @returns Band configuration or null if no match
 */
export function getPersonaBand(personaProfile: string): {
  bandKey: string;
  tolerance: number;
  weights: Record<string, number>;
} | null {
  const personaToKey = SIMULATOR_CONFIG.persona_to_band_key || {};
  const bands = SIMULATOR_CONFIG.persona_outcome_bands || {};

  // Try to find persona type in profile
  for (const [personaType, bandKey] of Object.entries(personaToKey)) {
    if (personaProfile.includes(personaType)) {
      const band = bands[bandKey as string];
      if (band) {
        return {
          bandKey: bandKey as string,
          tolerance: band.tolerance,
          weights: band.weights
        };
      }
    }
  }

  return null;
}

/**
 * Band-aware outcome resolver with signals-first approach.
 * Uses persona weights for plausible outcomes only, explicit signals override.
 *
 * @param currentState - Current conversation state
 * @param mqlResult - MQL detection result
 * @param selfServiceDetected - Self-service cues
 * @param deferredInterestDetected - Deferred interest cues
 * @param lastAttendeeMessage - Last attendee message
 * @param recentTranscript - Last 5-10 messages for context
 * @param personaProfile - Persona profile string
 * @param outcomeSeed - Deterministic seed for variance
 * @returns Outcome string and metadata
 */
export function determineBandedOutcome(
  currentState: string,
  mqlResult: { detected: boolean; hasNearTermIntent: boolean },
  selfServiceDetected: boolean,
  deferredInterestDetected: boolean,
  lastAttendeeMessage: string | undefined,
  recentTranscript: string,
  personaProfile: string,
  outcomeSeed: string
): {
  outcome: string;
  demoEligibilityScore?: number;
  personaBandKey?: string;
  personaWeightsUsed?: boolean;
  eligibleOutcomes?: string[];
  jitteredWeights?: Record<string, number>;
  reason?: string;
} {
  // Only determine outcome in SOLUTION_FRAMING or OUTCOME state
  if (currentState !== "OUTCOME" && currentState !== "SOLUTION_FRAMING") {
    return { outcome: "UNKNOWN", reason: "not_in_outcome_state" };
  }

  const lower = lastAttendeeMessage?.toLowerCase() || "";

  // HARD GUARDRAIL: Never exit if attendee just asked a question
  const askedQuestion =
    lower.includes("?") ||
    lower.includes("have you") ||
    lower.includes("do you") ||
    lower.includes("can you") ||
    lower.includes("could you") ||
    lower.includes("would you") ||
    lower.includes("what") ||
    lower.includes("how") ||
    lower.includes("why") ||
    lower.includes("when") ||
    lower.includes("where") ||
    lower.includes("who") ||
    lower.includes("which");

  if (askedQuestion) {
    return { outcome: "UNKNOWN", reason: "attendee_asked_question" };
  }

  // Acceptance signals
  const hasStrongAcceptance =
    lower.includes("sounds good") ||
    lower.includes("that works") ||
    lower.includes("perfect") ||
    lower.includes("let's do it") ||
    lower.includes("i'll take it") ||
    lower.includes("sign me up") ||
    lower.includes("that sounds great") ||
    lower.includes("works for me") ||
    lower.includes("i'm in") ||
    lower.includes("yes, please") ||
    lower.includes("absolutely") ||
    lower.includes("let's go") ||
    lower.includes("good starting point") ||
    lower.includes("would be helpful") ||
    lower.includes("i'll check out") ||
    lower.includes("i'll take a look") ||
    lower.includes("appreciate");

  // SIGNALS-FIRST RESOLUTION (explicit signals override persona weights)

  // 1. EXPLICIT DEMO REQUEST
  const wantsDemo =
    lower.includes("demo") ||
    lower.includes("show me") ||
    lower.includes("walk me through") ||
    lower.includes("see it in action");

  if (wantsDemo && hasStrongAcceptance) {
    return {
      outcome: "DEMO_READY",
      personaWeightsUsed: false,
      reason: "explicit_signal_override:demo_request"
    };
  }

  // 2. SELF-SERVICE REQUEST (always honor)
  if (selfServiceDetected) {
    return {
      outcome: "SELF_SERVICE_READY",
      personaWeightsUsed: false,
      reason: "explicit_signal_override:self_service_cues"
    };
  }

  // 3. DEFERRED INTEREST (explicit timing objection)
  if (deferredInterestDetected && !selfServiceDetected) {
    return {
      outcome: "DEFERRED_INTEREST",
      personaWeightsUsed: false,
      reason: "explicit_signal_override:deferred_cues"
    };
  }

  // 4. MQL REQUEST (badge scan + near-term intent)
  if (mqlResult.detected && mqlResult.hasNearTermIntent && !deferredInterestDetected && hasStrongAcceptance) {
    return {
      outcome: "MQL_READY",
      personaWeightsUsed: false,
      reason: "explicit_signal_override:mql_cues"
    };
  }

  // 5. EXPLICIT DISENGAGEMENT
  const explicitDisengagement =
    lower.includes("not interested") ||
    lower.includes("not relevant") ||
    lower.includes("gotta run") ||
    lower.includes("have to go") ||
    lower.includes("need to go") ||
    lower.includes("thanks, but no") ||
    lower.includes("not for us") ||
    lower.includes("not a fit") ||
    lower.includes("wrong fit") ||
    lower.includes("different direction");

  if (explicitDisengagement) {
    return {
      outcome: "POLITE_EXIT",
      personaWeightsUsed: false,
      reason: "explicit_signal_override:disengagement"
    };
  }

  // PERSONA-WEIGHTED RESOLUTION (no explicit signals, use weights for realism)

  // Check soft demo eligibility
  const demoEligibility = calculateDemoEligibility(recentTranscript, mqlResult);

  // Get persona band
  const band = getPersonaBand(personaProfile);

  if (!band) {
    // No band match, use default heuristic (continue conversation)
    return {
      outcome: "UNKNOWN",
      demoEligibilityScore: demoEligibility.score,
      reason: "no_persona_band_match"
    };
  }

  // Apply tolerance jitter to weights
  const numericSeed = hashSeed(outcomeSeed);
  const jitteredWeights = jitterWeights(band.weights, band.tolerance, numericSeed);

  // Build plausible outcomes based on conversation state
  const plausibleOutcomes: Record<string, number> = {};

  // DEMO_READY is plausible if soft eligibility OR strong acceptance + no objections
  if (demoEligibility.eligible || (hasStrongAcceptance && !deferredInterestDetected)) {
    plausibleOutcomes.DEMO_READY = jitteredWeights.DEMO_READY || 0;
  }

  // MQL_READY is plausible if has acceptance and no deferred cues
  if (hasStrongAcceptance && !deferredInterestDetected) {
    plausibleOutcomes.MQL_READY = jitteredWeights.MQL_READY || 0;
  }

  // DEFERRED_INTEREST is always plausible (neutral outcome)
  plausibleOutcomes.DEFERRED_INTEREST = jitteredWeights.DEFERRED_INTEREST || 0;

  // SELF_SERVICE_READY is plausible if no strong objections
  if (!explicitDisengagement) {
    plausibleOutcomes.SELF_SERVICE_READY = jitteredWeights.SELF_SERVICE_READY || 0;
  }

  // Normalize plausible weights
  const totalWeight = Object.values(plausibleOutcomes).reduce((sum, w) => sum + w, 0);

  if (totalWeight === 0) {
    // No plausible outcomes, continue conversation
    return {
      outcome: "UNKNOWN",
      demoEligibilityScore: demoEligibility.score,
      personaBandKey: band.bandKey,
      personaWeightsUsed: false,
      eligibleOutcomes: [],
      reason: "no_plausible_outcomes"
    };
  }

  const normalizedWeights: Record<string, number> = {};
  Object.entries(plausibleOutcomes).forEach(([outcome, weight]) => {
    normalizedWeights[outcome] = weight / totalWeight;
  });

  // Sample outcome using seeded randomness
  const sampledOutcome = sampleOutcome(normalizedWeights, numericSeed + 999);

  return {
    outcome: sampledOutcome,
    demoEligibilityScore: demoEligibility.score,
    personaBandKey: band.bandKey,
    personaWeightsUsed: true,
    eligibleOutcomes: Object.keys(plausibleOutcomes),
    jitteredWeights: normalizedWeights,
    reason: "persona_weighted_sampling"
  };
}

/**
 * Determine the final outcome based on session state and detected cues.
 *
 * CRITICAL GUARDRAILS (Conversation Integrity):
 * - NEVER trigger exit if attendee just asked a question
 * - ONLY trigger on explicit disengagement or accepted win outcome
 * - Competent/informed responses are NOT exit signals
 * - Curiosity keeps conversation alive
 *
 * Priority order:
 * 1. DEMO_READY (explicit demo acceptance)
 * 2. SELF_SERVICE_READY (explicit self-serve acceptance)
 * 3. DEFERRED_INTEREST (explicit "later/not ready" + no self-serve request)
 * 4. MQL_READY (ONLY badge scan + near-term intent OR sales talk + near-term + no "not ready")
 * 5. POLITE_EXIT (explicit disengagement)
 *
 * @param currentState - Current conversation state
 * @param mqlResult - MQL detection result with near-term intent flag
 * @param selfServiceDetected - Whether self-service cues were detected
 * @param deferredInterestDetected - Whether deferred interest cues were detected
 * @param lastAttendeeMessage - Last message from attendee (to check for acceptance)
 * @returns Outcome string
 */
export function determineOutcome(
  currentState: string,
  mqlResult: { detected: boolean; hasNearTermIntent: boolean },
  selfServiceDetected: boolean,
  deferredInterestDetected: boolean,
  lastAttendeeMessage?: string
): string {
  // Only determine outcome in SOLUTION_FRAMING or OUTCOME state
  if (currentState !== "OUTCOME" && currentState !== "SOLUTION_FRAMING") {
    return "UNKNOWN";
  }

  const lower = lastAttendeeMessage?.toLowerCase() || "";

  // HARD GUARDRAIL #1: Never exit if attendee just asked a question
  const askedQuestion =
    lower.includes("?") ||
    lower.includes("have you") ||
    lower.includes("do you") ||
    lower.includes("can you") ||
    lower.includes("could you") ||
    lower.includes("would you") ||
    lower.includes("what") ||
    lower.includes("how") ||
    lower.includes("why") ||
    lower.includes("when") ||
    lower.includes("where") ||
    lower.includes("who") ||
    lower.includes("which");

  if (askedQuestion) {
    return "UNKNOWN"; // Continue conversation, attendee is engaged
  }

  // Win Outcome Detection: Acceptance can be explicit OR implicit interest
  const hasStrongAcceptance =
    lower.includes("sounds good") ||
    lower.includes("that works") ||
    lower.includes("perfect") ||
    lower.includes("let's do it") ||
    lower.includes("i'll take it") ||
    lower.includes("sign me up") ||
    lower.includes("that sounds great") ||
    lower.includes("works for me") ||
    lower.includes("i'm in") ||
    lower.includes("yes, please") ||
    lower.includes("absolutely") ||
    lower.includes("let's go") ||
    lower.includes("good starting point") ||
    lower.includes("would be helpful") ||
    lower.includes("i'll check out") ||
    lower.includes("i'll take a look") ||
    lower.includes("appreciate");

  // 1. DEMO_READY: Explicit demo interest
  const wantsDemo =
    lower.includes("demo") ||
    lower.includes("show me") ||
    lower.includes("walk me through") ||
    lower.includes("see it in action");

  if (wantsDemo && hasStrongAcceptance) {
    return "DEMO_READY";
  }

  // 2. SELF_SERVICE_READY: Free tier, docs, case studies (explicit request)
  // CRITICAL: If self-service cues detected AND not explicitly disengaged, this is a success
  if (selfServiceDetected) {
    return "SELF_SERVICE_READY";
  }

  // 3. DEFERRED_INTEREST: Interested but timing isn't right (and no self-serve request)
  if (deferredInterestDetected && !selfServiceDetected) {
    return "DEFERRED_INTEREST";
  }

  // 4. MQL_READY: STRICT - requires near-term intent AND no deferred cues
  // Only if they explicitly want badge scan/sales AND show urgency AND not saying "not ready"
  if (mqlResult.detected && mqlResult.hasNearTermIntent && !deferredInterestDetected && hasStrongAcceptance) {
    return "MQL_READY";
  }

  // 5. POLITE_EXIT: ONLY for explicit disengagement (RARE)
  // This should be the LAST resort, not a default
  const explicitDisengagement =
    lower.includes("not interested") ||
    lower.includes("not relevant") ||
    lower.includes("gotta run") ||
    lower.includes("have to go") ||
    lower.includes("need to go") ||
    lower.includes("thanks, but no") ||
    lower.includes("not for us") ||
    lower.includes("not a fit") ||
    lower.includes("wrong fit") ||
    lower.includes("different direction");

  if (explicitDisengagement) {
    return "POLITE_EXIT";
  }

  // If we're in OUTCOME state but no clear outcome yet, keep conversation going
  return "UNKNOWN";
}

/**
 * Check if an outcome is a "win" outcome that should trigger auto-end.
 *
 * @param outcome - Outcome string
 * @returns true if win outcome
 */
export function isWinOutcome(outcome: string): boolean {
  return (
    outcome === "DEMO_READY" ||
    outcome === "SELF_SERVICE_READY" ||
    outcome === "MQL_READY"
  );
}

/**
 * System prompt for the attendee response.
 * IMPORTANT: state is controlled by the app, and the model must not change it.
 *
 * LEGACY WRAPPER: This function now uses the versioned prompt bundle system.
 * The actual prompt composition happens in promptComposer.ts using the
 * active prompt bundle from the bundle store.
 *
 * This wrapper maintains backward compatibility with existing code while
 * enabling centralized, versioned prompt management.
 */
export function buildAttendeePrompt(
  currentState: string,
  attendeeProfile: string,
  difficulty: string,
  conversationHistory: Array<{ role: string; content: string }>,
  enrichment?: EnrichmentResult | null
): string {
  // IMPORTANT: This is now a synchronous wrapper that returns a placeholder.
  // The actual async prompt composition happens in the message route.
  // This function is kept for TypeScript compatibility but should not be used directly.

  // For immediate backward compatibility, fall back to the legacy inline implementation
  // TODO: Update all callers to use composeAttendeeSystemPrompt directly

  const stateConfig = SIMULATOR_CONFIG.states?.[currentState];
  const stateDescription = stateConfig?.description ?? "";
  const attendeeBehavior = stateConfig?.attendee_behavior ?? [];

  const behaviorText =
    Array.isArray(attendeeBehavior) && attendeeBehavior.length > 0
      ? `Your behavior in this state: ${attendeeBehavior.join(", ")}.`
      : `The conversation is concluding. Choose an outcome that matches the trainee's behavior.`;

  // Keep history short to reduce token usage / noise
  const recentHistory = conversationHistory.slice(-12);

  const bannedKeywords = SIMULATOR_CONFIG.keyword_restrictions?.banned_product_keywords ?? [];

  // Build enrichment section if available
  const enrichmentSection = enrichment?.promptAddendum
    ? `\n\nENRICHMENT GUIDANCE:\n${enrichment.promptAddendum}`
    : "";

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
${attendeeProfile}${enrichmentSection}

RECENT CONVERSATION (most recent last):
${recentHistory.map((m) => `${m.role === "user" ? "Trainee" : "Attendee"}: ${m.content}`).join("\n")}

RESPONSE STYLE:
- Natural, imperfect speech. Mild skepticism is normal.
- Keep responses brief (1–3 sentences unless you become engaged).
- If the trainee pitches early or uses buzzwords, become more guarded.
- If the trainee shows empathy/validation, you may vent or share a brief war story (but only in PAIN_DISCOVERY or later).

Now respond as the attendee.`;
}