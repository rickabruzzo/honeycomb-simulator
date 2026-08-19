/**
 * Conversation Director — reactive attendee behavior engine.
 *
 * Given the session transcript, persona, and last trainee message, decides
 * what kind of reply the attendee should generate next.  The director is
 * intentionally state-machine-agnostic: it derives stage from transcript
 * signals rather than trusting session.currentState.
 *
 * Architecture (3 layers, evaluated top-to-bottom):
 *   1. INTENT LAYER  — infer the attendee's current disposition from their
 *      most recent message (confused? exiting? evaluating?).  Intent gates
 *      which moves are even allowed, preventing CTAs during confusion, etc.
 *   2. STAGE LAYER   — infer conversation stage from transcript signals
 *      (HOOK → RAPPORT → DISCOVERY → VALUE → OBJECTION → COMMITMENT).
 *   3. MOVE SELECTION — pick the best move from the stage-recommended set,
 *      constrained by intent gates, anti-repeat, CTA depth, and lockouts.
 *
 * The output is a DirectorDirective consumed by generateAttendeeReply to
 * select and filter persona bank entries (or constrain the LLM fallback).
 */

import type { SessionState } from "../storage";
import type { Persona } from "../scenarioTypes";
import { getMomentumBand, type MomentumBand } from "./momentumBands";
import { extractKeyPhrases } from "./reactiveness";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DirectorStage =
  | "HOOK"        // first 1-2 exchanges, no role/pain established
  | "RAPPORT"     // role stated but no pain surfaced
  | "DISCOVERY"   // pain stated, no aha/objection yet
  | "VALUE"       // aha signal detected: trainee connected Honeycomb to pain
  | "OBJECTION"   // attendee asks about adoption/pricing/rollout/lock-in
  | "COMMITMENT"; // badge scan / demo / self-serve intent expressed

export type DirectorMove =
  | "ask_clarifying"    // follow-up question or repair question
  | "share_pain"        // surface a pain anchor as a statement
  | "ask_hook"          // neutral opening question (HOOK stage only)
  | "answer"            // answer trainee's question in first person (prevents role-reversal)
  | "ask_demo"          // request to see the product
  | "ask_docs"          // ask for docs / free tier
  | "ask_rollout_effort"// object about adoption overhead
  | "ask_pricing"       // ask about cost model
  | "ask_badge"         // request badge scan / follow-up meeting
  | "deflect"           // short dismissive / guarded reply
  | "exit";             // wrapping up, grabbing materials

export type DirectorTone = "guarded" | "curious" | "engaged" | "committed";

/**
 * Attendee intent — inferred from the most recent attendee message.
 * Constrains which director moves are allowed on the next turn.
 */
export type AttendeeIntent =
  | "rapport"          // small talk / conference chat
  | "pain_sharing"     // describing a work pain point
  | "evaluating_fit"   // asking about docs / free tier / self-serve
  | "confused"         // meta-confusion / not following
  | "soft_exit"        // time pressure / wrapping up / send materials
  | "hard_exit"        // explicit disinterest / already have something
  | "commit_ready"     // badge scan / demo request / follow-up
  | "neutral";         // default — no strong signal

export interface DirectorDirective {
  stage: DirectorStage;
  move: DirectorMove;
  tone: DirectorTone;
  /** Pain anchor to surface (only for share_pain moves) */
  mustInclude?: { painAnchorId?: string };
  /** Opening phrases to avoid (drawn from recent attendee messages) */
  mustAvoid?: { phrases?: string[] };
  /** Override reply text for ask_hook moves (neutral hook bank) */
  hookOverride?: string;
  /** Override reply text for concrete follow-ups (abstract compare limiter) */
  concreteOverride?: string;
  /** Inferred attendee intent (for debugging / telemetry) */
  intent?: AttendeeIntent;
  /** When true, the trainee asked a small-talk question (conference/day) — reply with casual answer, not contextual callback */
  smallTalk?: boolean;
}

// ── Meta-confusion lockout ────────────────────────────────────────────────────
// When the attendee just expressed confusion / repair, suppress further
// ask_clarifying for the next 2 attendee turns to prevent spiral loops.

const META_CONFUSION_RE =
  /\b(not sure|lost|explain|clarify|not following|how does that relate|what were you trying to say|try again)\b/i;

export function isMetaConfusion(text: string): boolean {
  return META_CONFUSION_RE.test(text);
}

// ── Small-talk detection ─────────────────────────────────────────────────────

const SMALL_TALK_PATTERNS: RegExp[] = [
  /how'?s (your day|the conference|it going|things going)/i,
  /conference (treating you|so far)/i,
  /seen .* today .* stood out/i,
];

/**
 * Returns true when the trainee is asking a small-talk/conference question.
 * Requires a '?' to be present AND a pattern match.
 */
export function isSmallTalkQuestion(text: string): boolean {
  if (!text.includes("?")) return false;
  return SMALL_TALK_PATTERNS.some((p) => p.test(text));
}

/**
 * Scan attendee messages for the most recent meta-confusion signal.
 * If found, return true when fewer than 2 attendee messages have occurred since.
 */
export function metaConfusionLockoutActive(
  attendeeMessages: Array<{ text: string }>
): boolean {
  for (let i = attendeeMessages.length - 1; i >= 0; i--) {
    if (isMetaConfusion(attendeeMessages[i].text)) {
      const attendeeMsgsSince = attendeeMessages.length - 1 - i;
      return attendeeMsgsSince < 2;
    }
  }
  return false;
}

/**
 * When meta-confusion lockout prevents ask_clarifying, fall back to an
 * alternative move.  Priority: share_pain > ask_docs > exit.
 * Never falls back to deflect — a deflect after confusion reads as hostility.
 */
function chooseNonClarifyingFallback(
  stage: DirectorStage,
  history: DirectorMove[]
): DirectorMove {
  if (!isMoveTooRecent("share_pain", history)) return "share_pain";
  if (!isMoveTooRecent("ask_docs", history)) return "ask_docs";
  return "exit";
}

// ── Abstract compare limiter ────────────────────────────────────────────────
// Prevent the director from repeatedly selecting abstract multi-part/binary
// questions that cause confusion spirals (e.g. "is it more X or Y?").

/**
 * Returns true when text is a question containing an abstract binary comparison.
 */
export function isAbstractCompareQuestion(text: string): boolean {
  if (!text.includes("?")) return false;
  return /(more about|which is it|is it .* or .*)/i.test(text);
}

/**
 * If 2+ of the last 3 trainee messages are abstract compare questions,
 * the limiter is active and we should force concrete follow-ups.
 */
export function abstractCompareLimiterActive(
  recentTrainee: Array<{ text: string }>
): boolean {
  const last3 = recentTrainee.slice(-3);
  const count = last3.filter((m) => isAbstractCompareQuestion(m.text)).length;
  return count >= 2;
}

/**
 * Fixed bank of concrete single-question follow-ups.
 * Deterministic selection avoids repeats by using message count as seed.
 */
export const CONCRETE_FOLLOWUPS: string[] = [
  "What happens right after that?",
  "What's the first thing you check when this starts?",
  "Can you walk me through the last time it happened?",
  "When did you first notice it getting worse?",
];

// ── Neutral hook rule ────────────────────────────────────────────────────────
// When the attendee hasn't spoken yet and the system opener is non-verbal
// (e.g. "approaches looking visibly frustrated"), the first move should be a
// neutral hook — not a work-context assumption.

const NON_VERBAL_OPENER_RE = /\b(frustrated|visibly|approaches|walks up|sighs|looking)\b/i;

/**
 * Fixed bank of neutral hook questions for first contact after a non-verbal opener.
 */
export const NEUTRAL_HOOK_BANK: string[] = [
  "Hey, how's your day going?",
  "How's the conference treating you so far?",
  "Anything you've seen today that stood out?",
];

/**
 * Returns true if the session's first system message looks like a non-verbal
 * stage direction and the attendee has not yet spoken.
 */
function isNonVerbalOpener(session: SessionState): boolean {
  const attendeeMessages = session.transcript.filter((m) => m.type === "attendee");
  if (attendeeMessages.length > 0) return false;
  const firstSystem = session.transcript.find((m) => m.type === "system");
  if (!firstSystem) return false;
  return NON_VERBAL_OPENER_RE.test(firstSystem.text);
}

// ── Signal patterns ───────────────────────────────────────────────────────────

/** Attendee expresses "that would help" / value acknowledgement */
const AHA_PATTERNS: RegExp[] = [
  /\bthat (would|could|might|should) help\b/i,
  /\b(makes|make) sense\b/i,
  /\b(sounds|seem) (useful|helpful|valuable|relevant)\b/i,
  /\bwe (need|could use) (that|something like that)\b/i,
  /\bthat'?s (what we'?re |what I'?m )?(looking for|missing|struggling with|dealing with)/i,
  /\bthat'?s (pretty|really)? (good|valuable|useful|helpful|interesting)\b/i,
  /\bI can see (how|why|that)\b/i,
  /\bwe'?re dealing with (exactly |something like )?(that|this)\b/i,
];

/** Attendee asks about rollout, pricing, lock-in, security */
const OBJECTION_PATTERNS: RegExp[] = [
  /\b(how much|what'?s the (cost|price|pricing))\b/i,
  /\b(how (long|hard|much (work|effort)) (to|would it take to)? (set up|roll out|implement|adopt|integrate))\b/i,
  /\b(rollout|migration|implementation|onboarding) (plan|effort|timeline|overhead)\b/i,
  /\block[-\s]?in|vendor lock|switching cost\b/i,
  /\bdata (retention|privacy|security|residency)\b/i,
  /\bprocurement|security (review|questionnaire|approval)\b/i,
  /\b(compatible|integrat|work(s)? with)\b/i,
];

/** Attendee signals time pressure or disinterest */
const EXIT_PATTERNS: RegExp[] = [
  /\b(in a hurry|got to (run|go)|short on time|only have a (minute|second))\b/i,
  /\b(just browsing|just looking|not (really )?looking)\b/i,
  /\b(maybe later|not right now|not (really )?interested (right now)?)\b/i,
  /\b(send me (a |the )?(link|email|info|flyer|card))\b/i,
  /\b(have (any )?materials|brochure|one[ -]pager)\b/i,
];

/** Attendee states a role or team context */
const ROLE_PATTERNS: RegExp[] = [
  /\b(I'?m|I am|we are|I work as|our (team|group|org|engineering|platform))\b/i,
  /\b(SRE|engineer|developer|architect|manager|lead|CTO|VP|director|principal)\b/i,
  /\b(my (team|role|job|company|org|stack|tooling|setup))\b/i,
];

/** Attendee expresses commitment to follow up */
const COMMITMENT_PATTERNS: RegExp[] = [
  /\b(scan (my|your|the) badge|badge scan)\b/i,
  /\b(follow[ -]?up|reach out|get in touch|book a call|schedule (a call|time))\b/i,
  /\b(show me (a |the )?(demo|product|example)|walk me through)\b/i,
  /\b(I'? *ll (check (it )?out|try (it|this)|sign up))\b/i,
  /\b(I'? *d (like|love) (to|a) (see|try|talk|meet|demo))\b/i,
];

/** General pain indicator keywords for fallback pain detection */
const PAIN_KEYWORDS: string[] = [
  "incident", "outage", "alert", "debug", "trace", "latency", "slow",
  "error", "failure", "on-call", "oncall", "toil", "noise", "alert fatigue",
  "complex", "hard", "difficult", "mess", "painful", "broken", "fragmented",
];

// ── Intent inference patterns ─────────────────────────────────────────────────

const SOFT_EXIT_RE =
  /\b(send me (a |the )?(link|email|info|flyer|card)|one[ -]pager|got to (run|go)|need to run|short on time|in a hurry|just browsing|just looking|only have a (minute|second))\b/i;

const HARD_EXIT_RE =
  /\b(not (really )?(interested|looking)|maybe later|we already have (something|that)|not what we('re| are) looking for)\b/i;

const EVALUATING_FIT_RE =
  /\b(documentation|free tier|docs|trial|self[- ]serve|materials|brochure|links|review on my own)\b/i;

const COMMIT_READY_RE =
  /\b(scan (my|your|the) badge|badge scan|follow[ -]?up|reach out|book a call|schedule (a call|time)|show me (a |the )?(demo|product)|walk me through)\b/i;

const RAPPORT_RE =
  /\b(how'?s the conference|how'?s your day|seen anything|anything stand out|what brings you|nice to meet)\b/i;

const PAIN_SHARING_RE =
  /\b(incident|outage|alert|debug|trace|latency|slow|error|failure|on[- ]call|toil|noise|alert fatigue|painful|broken|fragmented|debugging|tracing|incidents|outages)\b/i;

// ── Intent inference ──────────────────────────────────────────────────────────

/**
 * Infer the attendee's current disposition from their most recent message.
 *
 * Uses short context (last 2 attendee messages) as a tiebreaker:
 *   - "docs" after confusion → soft_exit (not evaluating_fit)
 *   - "scan badge" after confusion/soft-exit → commit_ready only if COMMITTED
 */
export function inferAttendeeIntent(
  session: SessionState,
  band?: MomentumBand
): AttendeeIntent {
  const attendeeMessages = session.transcript.filter((m) => m.type === "attendee");
  if (attendeeMessages.length === 0) return "neutral";

  const lastMsg = attendeeMessages[attendeeMessages.length - 1].text;
  const last2 = attendeeMessages.slice(-2);
  const recentHasConfusion = last2.some(
    (m, i) => i < last2.length - 1 && isMetaConfusion(m.text)
  );

  // 1. Confused — highest priority (blocks all escalation)
  if (isMetaConfusion(lastMsg)) return "confused";

  // 2. Hard exit — explicit disinterest
  if (HARD_EXIT_RE.test(lastMsg)) return "hard_exit";

  // 3. Soft exit — time pressure / wrapping up
  if (SOFT_EXIT_RE.test(lastMsg)) return "soft_exit";

  // 4. Commit ready — badge scan / follow-up
  //    Tiebreaker: confusion in previous message downgrades unless COMMITTED
  if (COMMIT_READY_RE.test(lastMsg)) {
    if (recentHasConfusion && band !== "COMMITTED") {
      return "soft_exit";
    }
    return "commit_ready";
  }

  // 5. Evaluating fit — asking about docs / free tier
  //    Tiebreaker: confusion in previous message → soft_exit
  if (EVALUATING_FIT_RE.test(lastMsg)) {
    if (recentHasConfusion) return "soft_exit";
    return "evaluating_fit";
  }

  // 6. Rapport — small talk / conference questions
  if (RAPPORT_RE.test(lastMsg)) return "rapport";

  // 7. Pain sharing — describing work pain
  if (PAIN_SHARING_RE.test(lastMsg)) return "pain_sharing";

  // 8. Neutral — no strong signal
  return "neutral";
}

// ── Intent-gated move sets ────────────────────────────────────────────────────

/**
 * Returns the set of director moves allowed for a given attendee intent.
 *
 * Stage and band are passed for intent-specific gating (e.g. ask_badge
 * requires COMMITTED band + COMMITMENT stage during evaluating_fit).
 */
export function allowedMovesForIntent(
  intent: AttendeeIntent,
  stage: DirectorStage,
  band: MomentumBand
): Set<DirectorMove> {
  switch (intent) {
    case "rapport":
      return new Set<DirectorMove>(["ask_hook", "ask_clarifying", "share_pain", "answer"]);

    case "pain_sharing": {
      const moves = new Set<DirectorMove>([
        "ask_clarifying", "share_pain", "answer", "ask_rollout_effort", "ask_pricing",
      ]);
      // ask_demo allowed only in VALUE+ with depth (checked by caller)
      if (stage === "VALUE" || stage === "OBJECTION" || stage === "COMMITMENT") {
        moves.add("ask_demo");
      }
      return moves;
    }

    case "evaluating_fit": {
      const moves = new Set<DirectorMove>([
        "ask_docs", "ask_demo", "ask_rollout_effort", "ask_pricing", "ask_clarifying", "answer",
      ]);
      // ask_badge only if fully committed AND in commitment stage
      if (band === "COMMITTED" && stage === "COMMITMENT") {
        moves.add("ask_badge");
      }
      return moves;
    }

    case "confused":
      return new Set<DirectorMove>(["share_pain", "ask_clarifying", "answer"]);

    case "soft_exit":
      return new Set<DirectorMove>(["ask_docs", "exit"]);

    case "hard_exit":
      return new Set<DirectorMove>(["exit"]);

    case "commit_ready":
      return new Set<DirectorMove>([
        "ask_demo", "ask_badge", "ask_docs", "ask_pricing",
        "ask_rollout_effort", "exit",
      ]);

    case "neutral":
    default:
      // No additional restriction — stage-based behavior applies
      return new Set<DirectorMove>([
        "ask_clarifying", "share_pain", "answer", "ask_hook", "ask_demo", "ask_docs",
        "ask_rollout_effort", "ask_pricing", "ask_badge", "deflect", "exit",
      ]);
  }
}

/**
 * When the selected move is not allowed by intent, pick the best fallback.
 */
function intentFallbackMove(
  intent: AttendeeIntent,
  history: DirectorMove[]
): DirectorMove {
  switch (intent) {
    case "confused":
      // Prefer share_pain if ask_clarifying is overused (3+ in last 4)
      if (history.slice(-4).filter((m) => m === "ask_clarifying").length >= 3) {
        return "share_pain";
      }
      return "ask_clarifying";

    case "soft_exit":
      if (!isMoveTooRecent("ask_docs", history)) return "ask_docs";
      return "exit";

    case "hard_exit":
      return "exit";

    case "rapport":
      return "ask_hook";

    case "pain_sharing":
      if (!isMoveTooRecent("ask_clarifying", history)) return "ask_clarifying";
      return "share_pain";

    case "evaluating_fit":
      if (!isMoveTooRecent("ask_docs", history)) return "ask_docs";
      return "ask_rollout_effort";

    case "commit_ready":
      return "ask_badge"; // permissive — keep candidate when possible

    case "neutral":
    default:
      return "ask_clarifying";
  }
}

// ── Director history helpers ──────────────────────────────────────────────────

/** Read recent director moves from session (last 8 stored) */
export function getDirectorHistory(session: SessionState): DirectorMove[] {
  return ((session as any).directorHistory as DirectorMove[] | undefined) ?? [];
}

/** Append a move to director history; keeps last 8 */
export function recordDirectorMove(session: SessionState, move: DirectorMove): void {
  if (!(session as any).directorHistory) {
    (session as any).directorHistory = [];
  }
  const history = (session as any).directorHistory as DirectorMove[];
  history.push(move);
  if (history.length > 8) {
    (session as any).directorHistory = history.slice(-8);
  }
}

// ── Stage inference ───────────────────────────────────────────────────────────

function inferStage(session: SessionState): DirectorStage {
  const attendeeMessages = session.transcript.filter((m) => m.type === "attendee");
  const nonSystem = session.transcript.filter((m) => m.type !== "system");

  // HOOK only when no attendee messages yet — once the attendee has spoken,
  // infer stage from their content even on the first exchange.
  if (attendeeMessages.length === 0) return "HOOK";

  const allAttendeeText = attendeeMessages.map((m) => m.text).join(" ");

  const hasSurfacedPain =
    ((session as any).surfacedPainIds?.length ?? 0) > 0 ||
    PAIN_KEYWORDS.some((kw) => allAttendeeText.toLowerCase().includes(kw));

  const hasRoleStated = ROLE_PATTERNS.some((p) => p.test(allAttendeeText));
  const hasAha = AHA_PATTERNS.some((p) => p.test(allAttendeeText));
  const hasObjection = OBJECTION_PATTERNS.some((p) => p.test(allAttendeeText));
  const hasExit = EXIT_PATTERNS.some((p) => p.test(allAttendeeText));
  const hasCommitment = COMMITMENT_PATTERNS.some((p) => p.test(allAttendeeText));

  if (hasExit || hasCommitment) return "COMMITMENT";
  if (hasObjection) return "OBJECTION";
  if (hasAha) return "VALUE";
  if (hasSurfacedPain) return "DISCOVERY";
  if (hasRoleStated) return "RAPPORT";

  // If the attendee has already spoken at least once but no role/pain/aha/
  // objection/exit/commitment was detected, treat as RAPPORT rather than
  // lingering in HOOK forever.  This prevents infinite ask_hook loops.
  if (attendeeMessages.length >= 1) return "RAPPORT";

  return "HOOK";
}

// ── Momentum → tone ───────────────────────────────────────────────────────────

function bandToTone(band: MomentumBand): DirectorTone {
  switch (band) {
    case "GUARDED":   return "guarded";
    case "CURIOUS":   return "curious";
    case "ENGAGED":   return "engaged";
    case "COMMITTED": return "committed";
  }
}

// ── Alignment check ───────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  "i", "we", "you", "the", "a", "an", "is", "are", "was", "were",
  "do", "does", "can", "could", "would", "should", "to", "of", "in",
  "on", "at", "for", "with", "and", "or", "but", "so", "that", "this",
  "my", "our", "your", "it", "its", "how", "what", "when", "where",
  "why", "who", "have", "had", "has", "be", "been", "being", "will",
  "just", "not", "no", "if", "then", "than", "about", "up", "out",
  "more", "also", "well", "here", "there", "right", "like", "very",
  "get", "got", "any", "all", "by", "as", "are", "was", "been",
]);

function extractKeywords(text: string): Set<string> {
  const words = text.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/);
  return new Set(words.filter((w) => w.length > 3 && !STOPWORDS.has(w)));
}

function partialWordMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const diff = Math.abs(a.length - b.length);
  if (diff > 4) return false;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return longer.startsWith(shorter) && shorter.length >= 4;
}

function countPartialOverlap(
  attendeeKw: Set<string>,
  traineeKw: Set<string>
): number {
  let count = 0;
  const aArr = Array.from(attendeeKw);
  const tArr = Array.from(traineeKw);
  for (let i = 0; i < aArr.length; i++) {
    for (let j = 0; j < tArr.length; j++) {
      if (partialWordMatch(aArr[i], tArr[j])) {
        count++;
        break;
      }
    }
  }
  return count;
}

export function isTraineeAligned(
  lastTraineText: string,
  lastAttendeeText: string
): boolean {
  if (!lastAttendeeText || !lastTraineText) return true;

  const traineeWords = lastTraineText.trim().split(/\s+/);
  if (traineeWords.length <= 5) return true;

  const REFLECTION = /\b(sounds like|it sounds|it seems|you mentioned|you said|from what you('?re| are) (saying|describing)|when you say|i (hear|understand) (that|you))\b/i;
  if (REFLECTION.test(lastTraineText)) return true;

  const attendeeKw = extractKeywords(lastAttendeeText);
  const traineeKw = extractKeywords(lastTraineText);
  const overlap = countPartialOverlap(attendeeKw, traineeKw);

  const isAsking = /\?/.test(lastTraineText);
  if (isAsking && overlap >= 1) return true;

  const hasFollowUp =
    /\b(that|this|those|your|same|them|there|what you (said|mentioned)|what you're)\b/i.test(
      lastTraineText
    );
  if (hasFollowUp) return true;

  if (overlap >= 2) return true;

  return false;
}

// ── Question detection ─────────────────────────────────────────────────────────

/**
 * Returns true if the text contains a question mark, indicating the speaker
 * is asking a question.
 */
export function isQuestion(text: string): boolean {
  return text.includes("?");
}

// ── Move anti-repeat check ────────────────────────────────────────────────────

function isMoveTooRecent(move: DirectorMove, history: DirectorMove[]): boolean {
  // ask_clarifying is universal — never blocked
  if (move === "ask_clarifying") return false;

  // ask_hook should only fire once per session — blocked if ever used before
  if (move === "ask_hook") return history.includes("ask_hook");

  // answer can repeat frequently (attendee should answer questions), but cap
  // at 3+ in last 4 to ensure conversational variety
  if (move === "answer") {
    return history.slice(-4).filter((m) => m === "answer").length >= 3;
  }

  if (move === "ask_badge" || move === "ask_demo") {
    return history.slice(-2).includes(move);
  }

  if (move === "ask_rollout_effort") {
    return history.at(-1) === "ask_rollout_effort";
  }

  if (move === "deflect" || move === "exit") {
    return history.slice(-3).includes(move);
  }

  const last4 = history.slice(-4);
  const usageInLast4 = last4.filter((m) => m === move).length;
  if (usageInLast4 >= 2) return true;

  return history.slice(-4).includes(move);
}

// ── Move selection ────────────────────────────────────────────────────────────

interface DepthInfo {
  attendeeCount: number;
  totalCount: number;
}

function weightedPick(
  candidates: Array<[DirectorMove, number]>,
  totalCount: number
): DirectorMove {
  const totalWeight = candidates.reduce((sum, [, w]) => sum + w, 0);
  const seed = totalCount % totalWeight;
  let cumulative = 0;
  for (const [move, weight] of candidates) {
    cumulative += weight;
    if (seed < cumulative) return move;
  }
  return candidates[candidates.length - 1][0];
}

const CTA_MOVES = new Set<DirectorMove>(["ask_demo", "ask_docs", "ask_badge"]);

function hasDiscoveryDepth(
  stage: DirectorStage,
  band: MomentumBand,
  depth: DepthInfo
): boolean {
  if (stage === "HOOK" || stage === "RAPPORT") return false;
  if (depth.attendeeCount < 2) return false;
  if (depth.totalCount < 4) return false;
  if (band === "GUARDED") return false;
  return true;
}

function selectMove(
  stage: DirectorStage,
  band: MomentumBand,
  aligned: boolean,
  history: DirectorMove[],
  depth: DepthInfo,
  isTraineeQuestion: boolean
): DirectorMove {
  // 1. Repair takes highest priority
  if (!aligned && depth.totalCount > 1) {
    return "ask_clarifying";
  }

  // 1b. Answer prioritization — when the trainee asks a question, answer it
  //     instead of asking a question back (prevents role-reversal).
  //     Intent gating (step 6 in decideNextMove) will filter this out for
  //     hard_exit / soft_exit since "answer" is not in those allowed sets.
  if (aligned && isTraineeQuestion && stage !== "HOOK" && !isMoveTooRecent("answer", history)) {
    return "answer";
  }

  let candidate: DirectorMove;

  switch (stage) {
    case "HOOK":
      // ask_hook is ONLY for the very first attendee turn.
      // After that, even if stage infers HOOK, progress the conversation.
      if (depth.attendeeCount === 0) {
        candidate = "ask_hook";
      } else {
        candidate = aligned ? "share_pain" : "ask_clarifying";
      }
      break;

    case "RAPPORT":
      candidate = weightedPick(
        [["share_pain", 7], ["ask_clarifying", 3]],
        depth.totalCount
      );
      break;

    case "DISCOVERY": {
      candidate = weightedPick(
        [["share_pain", 65], ["ask_clarifying", 35]],
        depth.totalCount
      );
      break;
    }

    case "VALUE": {
      if (band === "GUARDED") {
        candidate = "ask_clarifying";
      } else if (band === "CURIOUS") {
        const allowDemo = hasDiscoveryDepth(stage, band, depth);
        if (allowDemo) {
          candidate = weightedPick(
            [["ask_clarifying", 7], ["ask_demo", 3]],
            depth.totalCount
          );
        } else {
          candidate = "ask_clarifying";
        }
      } else {
        if (!history.includes("ask_rollout_effort")) {
          candidate = "ask_rollout_effort";
        } else if (!history.includes("ask_pricing")) {
          candidate = "ask_pricing";
        } else {
          candidate = hasDiscoveryDepth(stage, band, depth)
            ? "ask_demo"
            : "ask_clarifying";
        }
      }
      break;
    }

    case "OBJECTION":
      candidate = weightedPick(
        [["ask_clarifying", 5], ["ask_rollout_effort", 3], ["ask_pricing", 2]],
        depth.totalCount
      );
      break;

    case "COMMITMENT":
      if (hasDiscoveryDepth(stage, band, depth)) {
        if (!history.includes("ask_badge")) {
          candidate = "ask_badge";
        } else if (!history.includes("ask_demo")) {
          candidate = "ask_demo";
        } else {
          candidate = "ask_docs";
        }
      } else {
        candidate = band === "ENGAGED" ? "ask_rollout_effort" : "ask_clarifying";
      }
      break;

    default:
      candidate = "ask_clarifying";
  }

  // 2. CTA gate: ask_demo / ask_docs / ask_badge must have discovery depth
  if (CTA_MOVES.has(candidate) && !hasDiscoveryDepth(stage, band, depth)) {
    candidate = "ask_clarifying";
  }

  // 3. Anti-repeat
  if (isMoveTooRecent(candidate, history)) {
    return "ask_clarifying";
  }

  return candidate;
}

// ── Next pain anchor selection ────────────────────────────────────────────────

function selectNextPainAnchorId(
  session: SessionState,
  persona: Persona | undefined
): string | undefined {
  if (!persona?.painAnchors) return undefined;
  const surfaced = ((session as any).surfacedPainIds as string[] | undefined) ?? [];
  const unsurfaced = persona.painAnchors.filter((p) => !surfaced.includes(p.id));
  if (unsurfaced.length === 0) return undefined;
  const primary = unsurfaced.filter((p) => p.priority === "primary");
  const pool = primary.length > 0 ? primary : unsurfaced;
  return pool[0].id;
}

// ── LLM prompt hint ───────────────────────────────────────────────────────────

export function directiveToPromptHint(directive: DirectorDirective): string {
  const moveHints: Record<DirectorMove, string> = {
    ask_clarifying:
      "Ask a short clarifying question that connects directly to what the trainee just said. Be cooperative and assume good intent. Do not scold or argue.",
    share_pain:
      "Express one specific, concrete pain point your team is dealing with as a plain statement — not a question.",
    ask_hook:
      "Open with a warm, neutral greeting or question — no work-context assumptions yet.",
    answer:
      "Answer the trainee's question directly, speaking in first person about your own team's situation. Do not ask a question back — describe your experience as a statement.",
    ask_demo:
      "Ask to see a quick live example or demo of the product.",
    ask_docs:
      "Ask about documentation, a free tier, or a way to self-serve try the product.",
    ask_rollout_effort:
      "Ask a skeptical question about how much work it takes to roll out or adopt this.",
    ask_pricing:
      "Ask a practical question about cost or pricing model.",
    ask_badge:
      "Ask the trainee to scan your badge or take your contact info for a follow-up.",
    deflect:
      "Give a short, guarded reply — you are busy and not yet engaged.",
    exit:
      "Wrap up the conversation naturally and ask for any materials to take away.",
  };
  return moveHints[directive.move] ?? "Respond directly to the trainee's last message.";
}

// ── Tone sanitization ─────────────────────────────────────────────────────────

/**
 * ask_clarifying must never carry tone="guarded" — at worst it should be
 * "curious", because a guarded clarifying question reads as an attack.
 */
function sanitizeDirectiveTone(move: DirectorMove, tone: DirectorTone): DirectorTone {
  if (move === "ask_clarifying" && tone === "guarded") return "curious";
  return tone;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Decide what kind of reply the attendee should generate next.
 *
 * Flow:
 *   1. Infer attendee intent (from last attendee message)
 *   2. Infer stage + band + alignment (from full transcript)
 *   3. Select candidate move (stage-based)
 *   4. Apply meta-confusion lockout
 *   5. Apply abstract compare limiter
 *   6. Apply intent constraint (gate + fallback)
 *   7. Sanitize tone, build directive
 */
export function decideNextMove(
  session: SessionState,
  persona: Persona | undefined,
  lastTraineeText: string
): DirectorDirective {
  const attendeeMessages = session.transcript.filter((m) => m.type === "attendee");
  const traineeMessages = session.transcript.filter((m) => m.type === "trainee");
  const nonSystem = session.transcript.filter((m) => m.type !== "system");
  const lastAttendeeText = attendeeMessages.at(-1)?.text ?? "";
  const history = getDirectorHistory(session);
  const band = getMomentumBand(session.momentum?.score ?? 0);
  const tone = bandToTone(band);
  const stage = inferStage(session);
  const depth: DepthInfo = {
    attendeeCount: attendeeMessages.length,
    totalCount: nonSystem.length,
  };

  // ── 1. Infer attendee intent ──────────────────────────────────────────────
  const intent = inferAttendeeIntent(session, band);

  // ── 2. Neutral hook rule ──────────────────────────────────────────────────
  // Non-verbal system opener + no attendee messages yet → neutral hook question
  if (isNonVerbalOpener(session)) {
    const hookIdx = nonSystem.length % NEUTRAL_HOOK_BANK.length;
    return {
      stage: "HOOK",
      move: "ask_hook",
      tone: "curious",
      hookOverride: NEUTRAL_HOOK_BANK[hookIdx],
      intent,
    };
  }

  // ── 2b. Small-talk short-circuit ────────────────────────────────────────
  // When the trainee asks a conference/day question in HOOK or RAPPORT,
  // return an "answer" directive with smallTalk=true so the generator
  // picks from the casual small-talk bank instead of contextual callbacks.
  // Note: alignment check is skipped because small-talk naturally lacks
  // keyword overlap ("how's your day?" shares no terms with prior turn).
  const aligned = isTraineeAligned(lastTraineeText, lastAttendeeText);
  if (
    (stage === "HOOK" || stage === "RAPPORT") &&
    isSmallTalkQuestion(lastTraineeText)
  ) {
    const mustAvoid: DirectorDirective["mustAvoid"] = {
      phrases: attendeeMessages
        .slice(-3)
        .map((m) => m.text.slice(0, 50).trim())
        .filter((p) => p.length > 10),
    };
    return {
      stage,
      move: "answer",
      tone,
      intent,
      smallTalk: true,
      mustAvoid,
    };
  }

  // ── 3. Stage-based move selection ─────────────────────────────────────────
  let move = selectMove(stage, band, aligned, history, depth, isQuestion(lastTraineeText));

  // ── 4. Meta-confusion lockout ─────────────────────────────────────────────
  const lockout = metaConfusionLockoutActive(attendeeMessages);
  if (lockout && move === "ask_clarifying") {
    move = chooseNonClarifyingFallback(stage, history);
  }

  // ── 5. Abstract compare limiter ───────────────────────────────────────────
  let concreteOverride: string | undefined;
  if (move === "ask_clarifying" && abstractCompareLimiterActive(traineeMessages)) {
    const idx = depth.totalCount % CONCRETE_FOLLOWUPS.length;
    concreteOverride = CONCRETE_FOLLOWUPS[idx];
  }

  // ── 6. Intent constraint ──────────────────────────────────────────────────
  // If intent is non-neutral, check whether the selected move is allowed.
  // If not, replace with the intent-specific fallback.
  if (intent !== "neutral") {
    const allowed = allowedMovesForIntent(intent, stage, band);
    if (!allowed.has(move)) {
      move = intentFallbackMove(intent, history);
    }

    // Double-check: if lockout pushed us to ask_docs/exit but intent is
    // "confused", the confused gate only allows share_pain/ask_clarifying.
    if (intent === "confused" && !allowed.has(move)) {
      move = intentFallbackMove(intent, history);
    }

    // Anti-repeat on intent fallback: if the fallback move is too recent,
    // scan the allowed set for a non-recent alternative.
    if (isMoveTooRecent(move, history)) {
      const allowedArr = Array.from(allowed);
      const alt = allowedArr.find((m) => !isMoveTooRecent(m, history));
      if (alt) move = alt;
      // If every allowed move is too recent, keep the fallback (least bad option)
    }
  }

  // ── 7. Pain anchor selection ──────────────────────────────────────────────
  let mustInclude: DirectorDirective["mustInclude"] | undefined;
  if (move === "share_pain") {
    const painAnchorId = selectNextPainAnchorId(session, persona);
    if (painAnchorId) mustInclude = { painAnchorId };
  }

  // Phrases to avoid: opening 50 chars of the last 3 attendee messages
  const mustAvoid: DirectorDirective["mustAvoid"] = {
    phrases: attendeeMessages
      .slice(-3)
      .map((m) => m.text.slice(0, 50).trim())
      .filter((p) => p.length > 10),
  };

  // ── 8. Build directive ────────────────────────────────────────────────────
  const finalTone = sanitizeDirectiveTone(move, tone);
  const directive: DirectorDirective = {
    stage, move, tone: finalTone, mustInclude, mustAvoid, intent,
  };
  if (concreteOverride) directive.concreteOverride = concreteOverride;
  return directive;
}
