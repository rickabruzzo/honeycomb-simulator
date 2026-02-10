import { SessionState } from "./storage";

/**
 * Calculate active time for a session, excluding idle gaps > 2 minutes.
 *
 * @param transcript - Session transcript with timestamps
 * @returns Active time in seconds
 */
function calculateActiveTime(transcript: Array<{ timestamp: string; type: string }>): number {
  if (transcript.length < 2) return 0;

  const IDLE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes
  let activeTime = 0;

  for (let i = 1; i < transcript.length; i++) {
    const prev = new Date(transcript[i - 1].timestamp).getTime();
    const curr = new Date(transcript[i].timestamp).getTime();
    const gap = curr - prev;

    // Only count gaps under idle threshold
    if (gap < IDLE_THRESHOLD_MS) {
      activeTime += gap;
    }
  }

  return Math.floor(activeTime / 1000); // Convert to seconds
}

export interface ScoreRecord {
  token: string;
  sessionId: string;
  personaId?: string;
  difficulty?: string;
  conferenceContext?: string;
  score: number; // 0-100
  grade: "A" | "B" | "C" | "D" | "F";
  breakdown: {
    listening: number; // 0-20
    discovery: number; // 0-20
    empathy: number; // 0-20
    otel_assumptions: number; // 0-20
    guardrails: number; // 0-20
  };
  highlights: string[];
  mistakes: string[];
  violations: string[];
  createdAt: string;
  completedAt: string;
  // Snapshot fields (Phase H1)
  conferenceId?: string;
  conferenceName?: string;
  personaDisplayName?: string;
  traineeId?: string;
  traineeNameShort?: string;
}

/**
 * Heuristic-based scoring for a completed session.
 * V1: No LLM required.
 */
export function scoreSession(
  session: SessionState,
  token: string
): ScoreRecord {
  const now = new Date().toISOString();

  // Extract trainee messages
  const traineeMessages = session.transcript
    .filter((m) => m.type === "trainee")
    .map((m) => m.text);

  const allTraineeText = traineeMessages.join(" ").toLowerCase();

  // --- LISTENING (0-20) ---
  const listeningPhrases = [
    "what i'm hearing",
    "sounds like",
    "so you're saying",
    "if i understand",
    "let me make sure",
    "to clarify",
    "help me understand",
  ];
  const listeningCount = listeningPhrases.filter((phrase) =>
    allTraineeText.includes(phrase)
  ).length;
  const listening = Math.min(20, listeningCount * 5 + 5); // Base 5, +5 per phrase

  // --- DISCOVERY (0-20) ---
  const questionCount = traineeMessages.filter((msg) =>
    msg.includes("?")
  ).length;
  const openEndedPhrases = [
    "what",
    "how",
    "tell me",
    "describe",
    "walk me through",
    "help me understand",
  ];
  const openEndedCount = traineeMessages.filter((msg) =>
    openEndedPhrases.some((phrase) => msg.toLowerCase().includes(phrase))
  ).length;

  const discovery = Math.min(
    20,
    questionCount * 2 + openEndedCount * 3 // Questions + open-ended bonus
  );

  // --- EMPATHY (0-20) ---
  const empathyPhrases = [
    "that must be",
    "frustrating",
    "i can imagine",
    "sorry",
    "understand",
    "hear you",
    "that's tough",
    "that sounds",
    "rough",
    "brutal",
  ];
  const empathyCount = empathyPhrases.filter((phrase) =>
    allTraineeText.includes(phrase)
  ).length;
  const empathy = Math.min(20, empathyCount * 4 + 2); // Base 2, +4 per phrase

  // --- OTEL ASSUMPTIONS (0-20) ---
  // REDUCED WEIGHT: Asking about OTel is good discovery, not a violation
  // Only penalize if trainee ASSERTS without asking
  const otelAssertions = traineeMessages.filter((msg) => {
    const lower = msg.toLowerCase();
    const hasOtel = lower.includes("opentelemetry") || /\botel\b/.test(lower);
    const isQuestion = msg.includes("?");
    const asksAboutOtel = isQuestion && (
      lower.includes("are you") ||
      lower.includes("do you") ||
      lower.includes("have you") ||
      lower.includes("familiar with")
    );
    const assertsOtel = (
      lower.includes("since you") ||
      lower.includes("with your") ||
      lower.includes("your otel") ||
      lower.includes("you're using")
    ) && hasOtel;

    return assertsOtel && !asksAboutOtel; // Only flag assertions
  });
  const otelAssumptions = Math.max(0, 20 - otelAssertions.length * 10); // -10 per actual assertion

  // --- GUARDRAILS (0-20) ---
  const violationCount = session.violations.length;
  const earlyPitchViolation = session.violations.some((v) =>
    v.includes("Early pitch")
  );

  let guardrails = 20;
  guardrails -= violationCount * 5; // -5 per violation
  if (earlyPitchViolation) guardrails -= 5; // Extra penalty for early pitch
  guardrails = Math.max(0, guardrails);

  // --- DETECT OUTCOME FROM TRANSCRIPT ---
  const lastFewMessages = session.transcript.slice(-5).map(m => m.text.toLowerCase()).join(" ");
  let detectedOutcome = "UNKNOWN";

  if (lastFewMessages.includes("self_service_ready") || lastFewMessages.includes("self-service")) {
    detectedOutcome = "SELF_SERVICE_READY";
  } else if (lastFewMessages.includes("mql_ready") || (lastFewMessages.includes("badge") && lastFewMessages.includes("scan"))) {
    detectedOutcome = "MQL_READY";
  } else if (lastFewMessages.includes("demo_ready") || lastFewMessages.includes("demo")) {
    detectedOutcome = "DEMO_READY";
  } else if (lastFewMessages.includes("deferred_interest") || (lastFewMessages.includes("later") && lastFewMessages.includes("radar"))) {
    detectedOutcome = "DEFERRED_INTEREST";
  }

  // Check turn count efficiency
  const traineeMessageCount = traineeMessages.length;
  const turnLimits = { easy: 10, medium: 12, hard: 14 };
  const difficulty = session.kickoff.difficulty || "medium"; // Default to medium if not set
  const limit = turnLimits[difficulty as keyof typeof turnLimits] || turnLimits.medium;
  const isEfficient = traineeMessageCount <= limit;

  // --- CUSTOMER IMPACT FOCUS (0-5 bonus) ---
  // Reward framing around customer impact, not just developer pain
  const customerImpactPhrases = [
    "customer",
    "end user",
    "user experience",
    "customer-facing",
    "customer impact",
    "affecting customers",
    "customer problems",
  ];
  const hasCustomerFocus = customerImpactPhrases.some((phrase) =>
    allTraineeText.includes(phrase)
  );
  const customerImpactBonus = hasCustomerFocus ? 5 : 0;

  // --- TOTAL SCORE ---
  let totalScore = listening + discovery + empathy + otelAssumptions + guardrails + customerImpactBonus;

  // Boost score for successful outcomes
  if (detectedOutcome === "SELF_SERVICE_READY" || detectedOutcome === "MQL_READY" || detectedOutcome === "DEMO_READY") {
    totalScore += 10; // Success bonus
  } else if (detectedOutcome === "DEFERRED_INTEREST") {
    totalScore += 5; // Smaller bonus for respectful close
  }

  // Slight penalty for inefficiency (but don't penalize successful outcomes too much)
  if (!isEfficient && detectedOutcome === "UNKNOWN") {
    totalScore -= 5;
  }

  const score = Math.min(100, Math.max(0, totalScore));

  // --- GRADE (OUTCOME-AWARE) ---
  let grade: "A" | "B" | "C" | "D" | "F";

  // Success outcomes have strict minimum grades
  if (detectedOutcome === "DEMO_READY") {
    // DEMO_READY: Earned explicit demo interest (high-value outcome)
    if (score >= 90 || (isEfficient && score >= 85)) grade = "A";
    else if (score >= 75) grade = "B";
    else grade = "C"; // Minimum C for earning demo interest
  } else if (detectedOutcome === "SELF_SERVICE_READY") {
    // SELF_SERVICE_READY: Clean self-service close (success outcome)
    // Tightened grading logic (Fix 3):
    // - B- minimum if: no violations + clear pain discovered + respectful close
    // - C only if: missed pain OR rushed close OR guardrail issues
    const hasClearPain = discovery >= 12; // At least 12/20 in discovery
    const hasRespectfulClose = guardrails >= 15; // At least 15/20 in guardrails
    const noViolations = session.violations.length === 0;

    if (score >= 90 || (isEfficient && score >= 85)) {
      grade = "A";
    } else if (noViolations && hasClearPain && hasRespectfulClose) {
      // B- minimum for clean self-service success
      grade = score >= 80 ? "B" : "B"; // B floor
    } else {
      // C if missed pain, rushed close, or guardrail issues
      grade = "C";
    }
  } else if (detectedOutcome === "MQL_READY") {
    // MQL_READY: Hot lead secured (highest-value outcome)
    // MINIMUM GRADE: B (can never be below B)
    if (score >= 90 || (isEfficient && score >= 85)) grade = "A";
    else grade = "B"; // Floor is B for MQL success
  } else if (detectedOutcome === "DEFERRED_INTEREST") {
    // DEFERRED_INTEREST: Respectful close, timing not right
    if (score >= 85 && isEfficient) grade = "B";
    else if (score >= 75) grade = "C";
    else if (score >= 65) grade = "D";
    else grade = "F"; // Can still get F if many violations
  } else {
    // Standard grading for POLITE_EXIT and UNKNOWN
    if (score >= 90) grade = "A";
    else if (score >= 80) grade = "B";
    else if (score >= 70) grade = "C";
    else if (score >= 60) grade = "D";
    else grade = "F";
  }

  // --- HIGHLIGHTS ---
  const highlights: string[] = [];
  if (detectedOutcome === "SELF_SERVICE_READY")
    highlights.push("Closed with appropriate self-service path (SUCCESS)");
  if (detectedOutcome === "MQL_READY")
    highlights.push("Secured MQL/follow-up opportunity (SUCCESS)");
  if (detectedOutcome === "DEMO_READY")
    highlights.push("Earned genuine demo interest (SUCCESS)");
  if (detectedOutcome === "DEFERRED_INTEREST")
    highlights.push("Respectful close with deferred interest (POSITIVE)");
  if (listening >= 15)
    highlights.push("Strong active listening with reflection phrases");
  if (discovery >= 15)
    highlights.push("Good use of open-ended discovery questions");
  if (empathy >= 15) highlights.push("Showed empathy and validation");
  if (otelAssumptions >= 18)
    highlights.push("Avoided making OTel assumptions");
  if (guardrails >= 18) highlights.push("Maintained keyword discipline");
  if (hasCustomerFocus)
    highlights.push("Framed conversation around customer impact");
  // Count unique states visited (including current state)
  const uniqueStates = new Set([
    ...session.stateHistory.map(h => h.from),
    ...session.stateHistory.map(h => h.to),
    session.currentState
  ]);
  const statesReached = uniqueStates.size;

  if (statesReached >= 4)
    highlights.push(
      `Advanced through ${statesReached} conversation states`
    );
  if (isEfficient)
    highlights.push(`Efficient convergence (${traineeMessageCount} turns)`);

  // --- MISTAKES ---
  const mistakes: string[] = [];
  if (listening < 10) mistakes.push("Lacked active listening and reflection");
  if (discovery < 10)
    mistakes.push("Too few discovery questions - mostly statements");
  if (empathy < 10)
    mistakes.push("Missed opportunities to validate and show empathy");
  if (otelAssumptions < 10)
    mistakes.push("Made assumptions about OTel familiarity");
  if (guardrails < 15)
    mistakes.push("Used banned keywords or pitched too early");
  if (session.currentState === "ICEBREAKER")
    mistakes.push("Conversation stalled in ICEBREAKER state");
  if (session.violations.length > 0) {
    mistakes.push(
      `${session.violations.length} guardrail violation(s) detected`
    );
  }

  // Limit to 6 each
  const finalHighlights = highlights.slice(0, 6);
  const finalMistakes = mistakes.slice(0, 6);

  return {
    token,
    sessionId: session.id,
    personaId: session.kickoff.personaId,
    difficulty: session.kickoff.difficulty || undefined,
    conferenceContext: session.kickoff.conferenceContext || undefined,
    score,
    grade,
    breakdown: {
      listening,
      discovery,
      empathy,
      otel_assumptions: otelAssumptions,
      guardrails,
    },
    highlights: finalHighlights,
    mistakes: finalMistakes,
    violations: session.violations,
    createdAt: session.startTime,
    completedAt: now,
    // Snapshot fields from session (Phase H1)
    conferenceId: session.kickoff.conferenceId,
    conferenceName: session.kickoff.conferenceName,
    personaDisplayName: session.kickoff.personaDisplayName,
    traineeId: session.kickoff.traineeId,
    traineeNameShort: session.kickoff.traineeNameShort,
  };
}
