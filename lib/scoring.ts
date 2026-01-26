import { SessionState } from "./storage";

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
  const otelMentions = traineeMessages.filter((msg) => {
    const lower = msg.toLowerCase();
    const hasOtel =
      lower.includes("opentelemetry") || /\botel\b/.test(lower);
    const isQuestion = msg.includes("?");
    return hasOtel && !isQuestion; // Mentioned without asking
  });
  const otelAssumptions = Math.max(0, 20 - otelMentions.length * 10); // -10 per assumption

  // --- GUARDRAILS (0-20) ---
  const violationCount = session.violations.length;
  const earlyPitchViolation = session.violations.some((v) =>
    v.includes("Early pitch")
  );

  let guardrails = 20;
  guardrails -= violationCount * 5; // -5 per violation
  if (earlyPitchViolation) guardrails -= 5; // Extra penalty for early pitch
  guardrails = Math.max(0, guardrails);

  // --- TOTAL SCORE ---
  const totalScore = listening + discovery + empathy + otelAssumptions + guardrails;
  const score = Math.min(100, Math.max(0, totalScore));

  // --- GRADE ---
  let grade: "A" | "B" | "C" | "D" | "F";
  if (score >= 90) grade = "A";
  else if (score >= 80) grade = "B";
  else if (score >= 70) grade = "C";
  else if (score >= 60) grade = "D";
  else grade = "F";

  // --- HIGHLIGHTS ---
  const highlights: string[] = [];
  if (listening >= 15)
    highlights.push("Strong active listening with reflection phrases");
  if (discovery >= 15)
    highlights.push("Good use of open-ended discovery questions");
  if (empathy >= 15) highlights.push("Showed empathy and validation");
  if (otelAssumptions >= 18)
    highlights.push("Avoided making OTel assumptions");
  if (guardrails >= 18) highlights.push("Maintained keyword discipline");
  if (session.stateHistory.length >= 3)
    highlights.push(
      `Advanced through ${session.stateHistory.length} conversation states`
    );
  if (session.currentState === "OUTCOME")
    highlights.push("Reached final OUTCOME state");

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
    difficulty: session.kickoff.difficulty,
    conferenceContext: session.kickoff.conferenceContext,
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
