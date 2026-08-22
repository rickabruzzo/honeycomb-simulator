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
    discovery: number; // 0-20
    listening: number; // 0-20
    empathy: number; // 0-20
    qualification: number; // 0-20
    guardrails: number; // 0-20
    handoff: number; // 0-20
  };
  highlights: string[];
  mistakes: string[];
  violations: string[];
  /** Per-dimension evidence quotes from the LLM judge (empty when heuristic-scored). */
  evidence: { dimension: string; quote: string; comment: string }[];
  /** Which path produced this score. */
  scoringMethod: "judge" | "heuristic";
  /** True when the session was run in training-wheels (assisted/guided) mode. */
  trainingWheels?: boolean;
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
  const rawBase = heuristicScore(session, token); // also our fallback
  // The heuristic scorer works on a 0-20 breakdown; the judge (and the /10 UI) use 0-10.
  // Scale the fallback breakdown so a heuristic result renders on the same scale as a judged one.
  const base: ScoreRecord = {
    ...rawBase,
    breakdown: {
      discovery: Math.round(rawBase.breakdown.discovery / 2),
      listening: Math.round(rawBase.breakdown.listening / 2),
      empathy: Math.round(rawBase.breakdown.empathy / 2),
      qualification: Math.round(rawBase.breakdown.qualification / 2),
      guardrails: Math.round(rawBase.breakdown.guardrails / 2),
      handoff: Math.round(rawBase.breakdown.handoff / 2),
    },
  };

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
    // Thresholds on the judge's 0-10 scale: strong >= 8, relative strengths >= 6, mistakes <= 4.
    const ranked = SCORING_DIMENSIONS.map((d) => ({ d, s: judge[d].score }));
    const strong = ranked.filter((r) => r.s >= 8);
    const relativeStrengths = strong.length
      ? strong
      : ranked.filter((r) => r.s >= 6).sort((a, b) => b.s - a.s).slice(0, 2);
    const highlights = relativeStrengths
      .map((r) => `${label(r.d)}: ${judge[r.d].rationale}`)
      .slice(0, 6);
    const mistakes = ranked
      .filter((r) => r.s <= 4)
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
      trainingWheels: session.trainingWheels,
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

  let discovery = Math.min(
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

  // --- OTEL ASSUMPTION CHECK (folded into DISCOVERY) ---
  // v3: OTel accuracy is no longer a standalone dimension. Asserting the attendee's OTel
  // maturity without asking means discovery was built on an unverified assumption, which the
  // rubric caps at 2/5 → 8/20. Asking about OTel is fine (good discovery), so only assertions
  // trip the cap.
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
  if (otelAssertions.length > 0) {
    discovery = Math.min(discovery, 8); // unverified OTel assumption caps discovery
  }

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

  // --- CUSTOMER IMPACT FOCUS (folded into DISCOVERY) ---
  // Framing around customer impact (not just developer pain) is a discovery-quality signal.
  // v3 folds it into discovery rather than adding a standalone total bonus.
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
  if (hasCustomerFocus) discovery = Math.min(20, discovery + 5);

  // --- QUALIFICATION (0-20) — coarse fallback, no keyword signal ---
  // Derived from discovery depth plus whether a next-step outcome was actually reached
  // (a plausibly-qualified conversation). Floored so it is never blank. Precision is the
  // judge's job; this only keeps a completed session from going unscored.
  const resolvedOutcome = detectedOutcome !== "UNKNOWN";
  let qualification = 8; // floor
  if (discovery >= 15) qualification += 6;
  else if (discovery >= 10) qualification += 4;
  else if (discovery >= 5) qualification += 2;
  if (resolvedOutcome) qualification += 4;
  qualification = Math.min(20, qualification);

  // --- HANDOFF (0-20) — derived from the detected outcome type ---
  // Outcome quality now lives here (and only here). A resolved next step scores high; a clean
  // deferral/exit still scores well; no detected next step floors at 6.
  let handoff: number;
  switch (detectedOutcome) {
    case "MQL_READY":
    case "DEMO_READY":
    case "SELF_SERVICE_READY":
      handoff = 16; // earned next step
      break;
    case "DEFERRED_INTEREST":
      handoff = 14; // respectful deferral
      break;
    case "POLITE_EXIT":
      handoff = 12; // clean exit
      break;
    default:
      handoff = 6; // UNKNOWN — no detected next step (floor, never blank)
  }

  // --- TOTAL SCORE (normalized over six 0-20 dimensions) ---
  const sum = discovery + listening + empathy + qualification + guardrails + handoff;
  let normalized = Math.round((sum / 120) * 100);

  // Severe confusion penalty: attendee was confused 3+ times → trainee wasn't communicating well
  if (confusionCount >= 3) {
    normalized -= 5;
  }

  const score = Math.min(100, Math.max(0, normalized));

  // Grade from the normalized total — same thresholds as the judge path, no outcome floor.
  const grade = deriveGrade(score);

  // --- HIGHLIGHTS ---
  const highlights: string[] = [];
  if (listening >= 15)
    highlights.push("Strong active listening with reflection phrases");
  if (discovery >= 15)
    highlights.push("Good use of open-ended discovery questions");
  if (empathy >= 15) highlights.push("Showed empathy and validation");
  if (qualification >= 15)
    highlights.push("Read the opportunity and gauged fit");
  if (guardrails >= 18) highlights.push("Maintained keyword discipline");
  if (handoff >= 15) highlights.push("Secured an appropriate next step");
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
  if (qualification < 10)
    mistakes.push("Never established whether this was a real opportunity");
  if (guardrails < 15)
    mistakes.push("Used banned keywords or pitched too early");
  if (handoff < 10)
    mistakes.push("No clear next step or handoff secured");
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
      discovery,
      listening,
      empathy,
      qualification,
      guardrails,
      handoff,
    },
    highlights: finalHighlights,
    mistakes: finalMistakes,
    violations: session.violations,
    evidence: [],
    scoringMethod: "heuristic",
    trainingWheels: session.trainingWheels,
    createdAt: session.startTime,
    completedAt: now,
    // Snapshot fields from session
    personaDisplayName: session.kickoff.personaDisplayName,
    traineeId: session.kickoff.traineeId,
    traineeNameShort: session.kickoff.traineeNameShort,
  };
}
