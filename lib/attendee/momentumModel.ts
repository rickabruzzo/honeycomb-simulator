/**
 * Phase 1: Minimal momentum tracking (no behavior changes)
 * Tracks conversation momentum via simple heuristics
 */

export type ConversationMomentum = {
  score: number;
  turn: number;
  lastUpdatedAt: string;
  // minimal context for alignment scoring
  lastAttendeeText?: string;
  lastTraineeText?: string;
};

const BASELINE_SCORE = 0;

/**
 * Initialize momentum for new sessions
 */
export function initializeMomentum(): ConversationMomentum {
  return {
    score: BASELINE_SCORE,
    turn: 0,
    lastUpdatedAt: new Date().toISOString(),
  };
}

/**
 * Update momentum based on message event
 * Tracks alignment penalties for non-answers, topic shifts, premature CTA/pitch
 */

const CTA_PHRASES = [
  "scan my badge",
  "scan your badge",
  "book a demo",
  "schedule a demo",
  "set up a demo",
  "talk to sales",
  "sales reach out",
  "follow up",
  "next step",
];

const PITCHY_PHRASES = [
  "we're honeycomb",
  "our platform",
  "we provide",
  "we offer",
  "single pane",
  "best in class",
  "industry leading",
];

const LISTENING_MARKERS = [
  "it sounds like",
  "what i'm hearing",
  "so you're saying",
  "if i understand",
  "you mentioned",
  "from what you described",
];

const STOPWORDS = new Set([
  "the","a","an","and","or","but","to","of","in","on","for","with","at","by","from",
  "is","are","was","were","be","been","being","it","that","this","these","those",
  "we","you","i","they","our","your","my","me","us","their","them","as","so",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s\-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter(t => t.length >= 3 && !STOPWORDS.has(t));
}

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function includesAny(text: string, phrases: string[]) {
  return phrases.some(p => text.includes(p));
}

export function updateMomentum(
  m: ConversationMomentum,
  event: { kind: "trainee" | "attendee"; text: string }
): ConversationMomentum {
  const raw = event.text ?? "";
  const text = raw.toLowerCase();
  let delta = 0;

  // attendee talking implies engagement
  if (event.kind === "attendee") delta += 2;

  // questions: more valuable from trainee
  const questionCount = (raw.match(/\?/g) || []).length;
  if (event.kind === "trainee") delta += Math.min(6, questionCount * 2);
  if (event.kind === "attendee") delta += Math.min(4, questionCount * 2);

  // trainee reflection/listening markers
  if (event.kind === "trainee" && includesAny(text, LISTENING_MARKERS)) {
    delta += 4;
  }

  // detect whether last attendee turn shows explicit interest
  const lastAttendee = (m.lastAttendeeText ?? "").toLowerCase();
  const attendeeHasInterestSignal =
    lastAttendee.includes("free tier") ||
    lastAttendee.includes("docs") ||
    lastAttendee.includes("documentation") ||
    lastAttendee.includes("demo") ||
    lastAttendee.includes("pricing") ||
    lastAttendee.includes("cost") ||
    lastAttendee.includes("scan") ||
    lastAttendee.includes("?");

  // premature CTA penalty (trainee only)
  if (event.kind === "trainee" && includesAny(text, CTA_PHRASES) && !attendeeHasInterestSignal) {
    delta -= 8;
  }

  // pitch-too-early penalty (trainee only)
  const painKeywords = ["incident","outage","tracing","debug","mttr","on-call","alerts","logs","slow","latency","errors"];
  const lastAttendeeLooksLikePain = painKeywords.some(k => lastAttendee.includes(k));
  if (event.kind === "trainee" && lastAttendeeLooksLikePain && includesAny(text, PITCHY_PHRASES)) {
    delta -= 5;
  }

  // relevance scoring: did trainee respond to what attendee just said?
  if (event.kind === "trainee" && m.lastAttendeeText) {
    const aTok = tokenize(m.lastAttendeeText);
    const tTok = tokenize(raw);
    const sim = jaccard(aTok, tTok);
    if (sim >= 0.12) delta += 5;
    else if (sim >= 0.06) delta += 2;
    else delta -= 6; // likely non-answer/topic shift
  }

  // non-answer penalty (trainee only): very short + no question + no reflection
  if (event.kind === "trainee") {
    const wordCount = raw.trim().split(/\s+/).filter(Boolean).length;
    const hasQuestion = questionCount > 0;
    const hasListening = includesAny(text, LISTENING_MARKERS);
    if (wordCount <= 6 && !hasQuestion && !hasListening) {
      delta -= 4;
    }
  }

  // clamp per-turn swing and overall score
  delta = clamp(delta, -12, 12);

  return {
    score: clamp((m.score ?? 0) + delta, 0, 100),
    turn: (m.turn ?? 0) + 1,
    lastUpdatedAt: new Date().toISOString(),
    lastAttendeeText: event.kind === "attendee" ? raw : m.lastAttendeeText,
    lastTraineeText: event.kind === "trainee" ? raw : m.lastTraineeText,
  };
}
