/**
 * Conversation Director — reactive attendee behavior engine.
 *
 * Given the session transcript, persona, and last trainee message, decides
 * what kind of reply the attendee should generate next.  The director is
 * intentionally state-machine-agnostic: it derives stage from transcript
 * signals rather than trusting session.currentState.
 *
 * The output is a DirectorDirective consumed by generateAttendeeReply to
 * select and filter persona bank entries (or constrain the LLM fallback).
 *
 * Key properties:
 *  - Misaligned trainee → repair move (ask_clarifying / deflect)
 *  - Stage inferred from transcript keywords, not preset scripts
 *  - Momentum band gates how willing the attendee is to commit
 *  - Director history prevents move repetition (anti-loop)
 */

import type { SessionState } from "../storage";
import type { Persona } from "../scenarioTypes";
import { getMomentumBand, type MomentumBand } from "./momentumBands";

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
  | "ask_demo"          // request to see the product
  | "ask_docs"          // ask for docs / free tier
  | "ask_rollout_effort"// object about adoption overhead
  | "ask_pricing"       // ask about cost model
  | "ask_badge"         // request badge scan / follow-up meeting
  | "deflect"           // short dismissive / guarded reply
  | "exit";             // wrapping up, grabbing materials

export type DirectorTone = "guarded" | "curious" | "engaged" | "committed";

export interface DirectorDirective {
  stage: DirectorStage;
  move: DirectorMove;
  tone: DirectorTone;
  /** Pain anchor to surface (only for share_pain moves) */
  mustInclude?: { painAnchorId?: string };
  /** Opening phrases to avoid (drawn from recent attendee messages) */
  mustAvoid?: { phrases?: string[] };
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

/**
 * Returns false when the trainee's message shares no meaningful keywords with
 * the last attendee message AND does not appear to be a follow-up question.
 * This is the primary misalignment detector.
 */
export function isTraineeAligned(
  lastTraineText: string,
  lastAttendeeText: string
): boolean {
  if (!lastAttendeeText || !lastTraineText) return true;

  const attendeeKw = extractKeywords(lastAttendeeText);
  const traineeKw = extractKeywords(lastTraineText);

  // Count shared keywords
  const overlap = [...attendeeKw].filter((kw) => traineeKw.has(kw)).length;

  // Is the trainee asking a question? (follow-ups count)
  const isAsking = /\?/.test(lastTraineText);

  // Does the trainee use follow-up references to the prior turn?
  const hasFollowUp = /\b(that|this|those|your|same|it|them|there)\b/i.test(lastTraineText);

  // Aligned if: 2+ keyword overlap, asking with 1+ overlap, or any follow-up reference
  // (A trainee saying "that/this/those" IS responding to the attendee even without exact
  //  keyword overlap — e.g. "That slow debugging is what we solve.")
  return overlap >= 2 || (isAsking && overlap >= 1) || hasFollowUp;
}

// ── Move anti-repeat check ────────────────────────────────────────────────────

/**
 * Returns true if the candidate move is too recent in the history.
 * Badge/demo commitment moves have shorter cooldown (2 turns) so they can
 * re-fire faster when the attendee is genuinely committed.
 */
function isMoveTooRecent(move: DirectorMove, history: DirectorMove[]): boolean {
  if (move === "ask_clarifying") return false; // Never too recent — repair is always valid
  if (move === "ask_badge" || move === "ask_demo") {
    return history.slice(-2).includes(move);   // 2-turn cooldown
  }
  if (move === "deflect" || move === "exit") {
    return history.slice(-3).includes(move);   // 3-turn cooldown
  }
  return history.slice(-4).includes(move);     // 4-turn cooldown for all others
}

// ── Move selection ────────────────────────────────────────────────────────────

interface DepthInfo {
  attendeeCount: number;
  totalCount: number;
}

function selectMove(
  stage: DirectorStage,
  band: MomentumBand,
  aligned: boolean,
  history: DirectorMove[],
  depth: DepthInfo
): DirectorMove {
  // 1. Repair takes highest priority (skip only on the very first message — no prior context)
  if (!aligned && depth.totalCount > 1) {
    return "ask_clarifying";
  }

  let candidate: DirectorMove;

  switch (stage) {
    case "HOOK":
      candidate = band === "GUARDED" ? "deflect" : "share_pain";
      break;

    case "RAPPORT":
      candidate = "share_pain";
      break;

    case "DISCOVERY": {
      // Alternate: share pain → ask clarifying → share pain → …
      const last = history.at(-1);
      candidate = last === "share_pain" ? "ask_clarifying" : "share_pain";
      break;
    }

    case "VALUE": {
      if (band === "GUARDED") {
        candidate = "ask_clarifying";
      } else if (band === "CURIOUS") {
        // Alternate: clarifying ↔ demo interest
        const last = history.at(-1);
        candidate = last === "ask_clarifying" ? "ask_demo" : "ask_clarifying";
      } else {
        // ENGAGED / COMMITTED: probe rollout/pricing before requesting demo
        if (!history.includes("ask_rollout_effort")) candidate = "ask_rollout_effort";
        else if (!history.includes("ask_pricing")) candidate = "ask_pricing";
        else candidate = "ask_demo";
      }
      break;
    }

    case "OBJECTION":
      // Stay on the objection — ask for more detail rather than jumping forward
      candidate = "ask_clarifying";
      break;

    case "COMMITMENT":
      if (
        (band === "COMMITTED" || band === "ENGAGED") &&
        depth.attendeeCount >= 2 &&
        depth.totalCount >= 4
      ) {
        if (!history.includes("ask_badge")) candidate = "ask_badge";
        else if (!history.includes("ask_demo")) candidate = "ask_demo";
        else candidate = "ask_docs";
      } else {
        candidate = band === "ENGAGED" ? "ask_demo" : "ask_docs";
      }
      break;

    default:
      candidate = "ask_clarifying";
  }

  // 2. Anti-repeat: if this move was used too recently, ask for clarification instead
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
  // Prefer primary over secondary
  const primary = unsurfaced.filter((p) => p.priority === "primary");
  const pool = primary.length > 0 ? primary : unsurfaced;
  return pool[0].id;
}

// ── LLM prompt hint ───────────────────────────────────────────────────────────

/**
 * Returns a one-sentence instruction for the LLM system prompt that reflects
 * the current directive move.  Appended to the composed system prompt when
 * the template path returned null.
 */
export function directiveToPromptHint(directive: DirectorDirective): string {
  const moveHints: Record<DirectorMove, string> = {
    ask_clarifying:
      "Ask a direct clarifying question or push back on the trainee's last message — do not introduce a new topic.",
    share_pain:
      "Express one specific, concrete pain point your team is dealing with as a plain statement — not a question.",
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

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Decide what kind of reply the attendee should generate next.
 *
 * @param session        - Full session state (transcript + momentum + history)
 * @param persona        - Persona object (pain anchors, question bank, etc.)
 * @param lastTraineeText - The trainee's most recent message
 */
export function decideNextMove(
  session: SessionState,
  persona: Persona | undefined,
  lastTraineeText: string
): DirectorDirective {
  const attendeeMessages = session.transcript.filter((m) => m.type === "attendee");
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

  const aligned = isTraineeAligned(lastTraineeText, lastAttendeeText);
  const move = selectMove(stage, band, aligned, history, depth);

  // Pain anchor selection for share_pain moves
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

  return { stage, move, tone, mustInclude, mustAvoid };
}
