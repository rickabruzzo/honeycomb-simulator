import { SessionState } from "./storage";
import { judgeSession } from "./scoring/judge";
import { judgeResultToScore, deriveGrade } from "./scoring/judge-mapping";
import { SCORING_DIMENSIONS, hasTraineeContent } from "./scoring/rubric";
import { getTraineeMessages, getAttendeeMessages } from "./scoringInput";
import {
  detectOutcomeFromTranscript,
  outcomeSignalToCommittedOutcome,
} from "./attendee/outcomeSignals";

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
  /** Per-dimension evidence quotes from the LLM judge (empty when heuristic-scored). */
  evidence: { dimension: string; quote: string; comment: string }[];
  /** Which path produced this score. */
  scoringMethod: "judge" | "heuristic";
  createdAt: string;
  completedAt: string;
  // Snapshot fields
  personaDisplayName?: string;
  traineeId?: string;
  traineeNameShort?: string;
}

/**
 * Heuristic-based scoring for a completed session.
 * V1: No LLM required.
 */
/**
 * Score a completed session.
 *
 * Async because scoring now consults an LLM judge (wired in a later task). For now it
 * delegates to the retained heuristic scorer unchanged, so every consumer keeps working while
 * the judge is built alongside.
 */
export async function scoreSession(
  session: SessionState,
  token: string
): Promise<ScoreRecord> {
  const now = new Date().toISOString();
  const base = heuristicScore(session, token); // also our fallback

  if (!hasTraineeContent(session)) return base;

  try {
    const judge = await judgeSession(session);
    const mapped = judgeResultToScore(judge, session.detectedOutcome?.type ?? null);

    // Highlights and mistakes come ONLY from the judge here - never fall back to the
    // heuristic scorer's, whose separate logic can contradict the judge (e.g. the heuristic
    // "Avoided making OTel assumptions" appearing while the judge scored OTel 0/20 for never
    // asking). A strong dimension is >= 4; if none reached that, the best genuine positives
    // (>= 3, "generally followed up") are surfaced as relative strengths rather than inventing
    // praise. A truly weak session simply shows no "What You Did Well" items.
    const ranked = SCORING_DIMENSIONS.map((d) => ({ d, s: judge[d].score }));
    const strong = ranked.filter((r) => r.s >= 4);
    const relativeStrengths = strong.length
      ? strong
      : ranked.filter((r) => r.s >= 3).sort((a, b) => b.s - a.s).slice(0, 2);
    const highlights = relativeStrengths
      .map((r) => `${label(r.d)}: ${judge[r.d].rationale}`)
      .slice(0, 6);
    const mistakes = ranked
      .filter((r) => r.s <= 2)
      .sort((a, b) => a.s - b.s)
      .map((r) => `${label(r.d)}: ${judge[r.d].rationale}`)
      .slice(0, 6);

    return {
      ...base,
      score: mapped.score,
      grade: deriveGrade(mapped.score),
      breakdown: mapped.breakdown,
      highlights,
      mistakes,
      evidence: mapped.evidence,
      scoringMethod: "judge",
      completedAt: now,
    };
  } catch (err) {
    console.warn(
      "[scoring] judge failed, using heuristic fallback:",
      err instanceof Error ? err.message : "unknown error"
    );
    return base;
  }
}

function label(d: string): string {
  return d
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * The deterministic heuristic scorer. Retained as the fallback for scoreSession when the LLM
 * judge is unavailable, and exported so the heuristic regression tests
 * (scoring.confusionPenalty, scoring.traineeOnly) can exercise it directly without a provider.
 */
export function heuristicScore(
  session: SessionState,
  token: string
): ScoreRecord {
  const now = new Date().toISOString();

  // Score ONLY trainee messages — attendee text must never contribute points.
  const traineeMessages = getTraineeMessages(session.transcript).map(
    (m) => m.text
  );

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
    "did i get that right",
    "is that correct",
    "am i understanding",
    "you mentioned",
    "you said",
    "it sounds like you",
    "from what you're describing",
  ];
  const listeningCount = listeningPhrases.filter((phrase) =>
    allTraineeText.includes(phrase)
  ).length;

  // Improved scoring: Base 5, +3 per phrase (can reach 20 with 5 phrases)
  // This is more forgiving than the old +5 per phrase which required only 3
  let listening = Math.min(20, listeningCount * 3 + 5);

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

  // --- ATTENDEE CONFUSION PENALTY ---
  // When the attendee repeatedly expresses confusion, penalize the trainee's
  // listening score (they're not communicating clearly). This reads attendee
  // messages as *context* but never awards points — only subtracts.
  const CONFUSION_RE = /\b(not sure|lost|explain|clarify|not following|how does that relate|what were you trying to say|try again)\b/i;
  const attendeeMessages = getAttendeeMessages(session.transcript);
  const confusionCount = attendeeMessages.filter((m) => CONFUSION_RE.test(m.text)).length;

  // Apply confusion penalties (after breakdown categories, before total/grade)
  if (confusionCount >= 2) {
    listening = Math.max(0, listening - 5);
  }

  // --- DETECT OUTCOME ---
  // 1. Prefer session.pendingOutcome (set by the outcome commitment system during
  //    the conversation — covers DEFERRED_INTEREST and other outcomes).
  // 2. Fall back to detectOutcomeFromTranscript which scans ATTENDEE messages only.
  //    Trainee text must never trigger an outcome bonus.
  let detectedOutcome = "UNKNOWN";
  if (session.pendingOutcome) {
    detectedOutcome = session.pendingOutcome;
  } else {
    const outcomeSignal = detectOutcomeFromTranscript(session.transcript);
    detectedOutcome = outcomeSignalToCommittedOutcome(outcomeSignal) ?? "UNKNOWN";
  }

  // Check turn count efficiency
  const traineeMessageCount = traineeMessages.length;
  const limit = 12; // Standard turn limit
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

  // Severe confusion penalty: attendee was confused 3+ times → trainee wasn't communicating well
  if (confusionCount >= 3) {
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
    evidence: [],
    scoringMethod: "heuristic",
    createdAt: session.startTime,
    completedAt: now,
    // Snapshot fields from session
    personaDisplayName: session.kickoff.personaDisplayName,
    traineeId: session.kickoff.traineeId,
    traineeNameShort: session.kickoff.traineeNameShort,
  };
}
