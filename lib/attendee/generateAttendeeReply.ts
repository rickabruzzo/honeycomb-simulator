/**
 * Main attendee response generation engine.
 *
 * DIRECTOR-DRIVEN FLOW (Phase 8):
 *  1. decideNextMove() → DirectorDirective (stage + move + tone)
 *  2. generateFromDirective() → picks content from persona banks or phrase banks
 *  3. If no match → return null (LLM fallback, constrained by directive hint in route)
 *  4. banned phrase filter + postProcess
 *  5. Return
 *
 * The director decides what KIND of reply to generate.  generateFromDirective
 * finds content that matches that move type.  The old cascading priority
 * chain is replaced by this two-step model.
 */

import { SessionState } from "../storage";
import { postProcessAttendeeText } from "./postProcess";
import { sanitizeResponse } from "./bannedPhraseFilter";
import type { Persona } from "../scenarioTypes";
import {
  decideNextMove,
  recordDirectorMove,
  detectNamedTools,
  detectSolutionMention,
  detectProductExplanation,
  isTraineeBadgeOffer,
  isQuestion,
  NEUTRAL_HOOK_BANK,
  type DirectorDirective,
  type DirectorMove,
} from "./conversationDirector";
import {
  enforceContinuity,
  extractKeyPhrases,
  type ContinuityContext,
} from "./reactiveness";
import {
  resolveTopicUpdate,
  isPainAnchorOnTopic,
} from "./topicDetector";
import {
  isDiscoveryQuestion,
  EVALUATION_QUESTIONS,
} from "./questionFilter";
import {
  pickBoothEntryResponse,
  type BoothEntryMode,
} from "./boothFaqBehavior";
import { decideReplyOwner } from "./replyPolicy";

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

// ── Built-in phrase banks for move types ─────────────────────────────────────

/**
 * Keyword-templated cooperative clarifiers — these replace the old
 * argumentative REPAIR_QUESTIONS.  Each template takes a domain/generic
 * term and produces a specific, empathetic follow-up.
 */
const COOPERATIVE_CLARIFIERS: Array<(term: string) => string> = [
  (term) => `When you mention ${term}, what does that look like day-to-day for your team?`,
  (term) => `On the ${term} side — is that something that's gotten worse recently?`,
  (term) => `Interesting — when you say ${term}, are you thinking more about the tooling or the process?`,
  (term) => `Got it — and on ${term}, what have you tried so far?`,
  (term) => `So with ${term} — what would a better version of that look like for you?`,
  (term) => `That's helpful — on ${term}, how does your team handle that today?`,
  (term) => `Right — and when ${term} comes up, who usually gets pulled in?`,
  (term) => `Makes sense — is ${term} the biggest pain point, or is there something else behind it?`,
];

/** Fallback when no keyword can be extracted — still cooperative, never scolding. */
const GENERIC_COOPERATIVE_CLARIFIERS: string[] = [
  "Can you tell me more about how that works for your team day-to-day?",
  "Interesting — what does that look like in practice?",
  "Got it — and how has your team been handling that so far?",
  "That's helpful context. What's been the biggest challenge there?",
  "Right — and how long has that been the situation?",
];

const DEMO_PHRASES: string[] = [
  "Can you actually walk me through what this looks like in practice?",
  "I'd have to see it to believe it—can you show me a quick example?",
  "Do you have something you can pull up right now?",
  "Can you show me a concrete use case?",
];

const DOCS_PHRASES: string[] = [
  "Is there documentation I could review on my own time?",
  "Do you have a free tier I could try before committing to anything?",
  "Can you send me some links to look at later?",
  "Is there a trial environment I can poke around in?",
];

const ROLLOUT_PHRASES: string[] = [
  "Okay, but how much work is it to actually roll this out?",
  "What's the real adoption overhead? We're pretty lean on bandwidth.",
  "How long does it take most teams to get up and running?",
  "What does the onboarding process actually look like?",
];

const PRICING_PHRASES: string[] = [
  "What does this cost? I'll have to justify it to someone.",
  "What's the pricing model—per seat, usage-based, something else?",
  "Any chance there's a free tier, or is it paid from day one?",
  "What do teams like ours typically pay?",
];

const BADGE_PHRASES: string[] = [
  "Can you scan my badge so someone can follow up with me?",
  "This sounds interesting—can we set up a follow-up?",
  "I'd like to loop in a couple people from my team. Can you grab my badge?",
  "Can I get your card? I want to continue this conversation.",
];

const DEFLECT_PHRASES: string[] = [
  "I'm just browsing for now.",
  "We already have something for that.",
  "I'm a bit time-pressured today.",
  "Not really what we're looking for right now.",
];

const EXIT_PHRASES: string[] = [
  "This has been useful. Do you have anything I can take away?",
  "I should get moving—thanks for the overview.",
  "Can you send me a link or a one-pager? I need to run.",
  "I appreciate it—can you scan my badge for a follow-up?",
];

// ── Small-talk answer banks ──────────────────────────────────────────────────

const SMALL_TALK_ANSWERS: string[] = [
  "Pretty good — busy but fun.",
  "Hectic, but I've seen a couple great talks.",
  "Good so far — my feet are already done.",
  "Not bad — just bouncing between booths.",
  "Honestly a bit chaotic, but in a good way.",
];

const SMALL_TALK_PIVOTS: string[] = [
  "I'm mostly looking at observability and incident response tooling.",
  "We're trying to get better at debugging incidents and reducing alert noise.",
  "I'm here to see what's new in tracing and incident workflows.",
  "We've got some pain around debugging and on-call right now.",
  "We're evaluating a few options to speed up root cause during incidents.",
];

// ── Stack-evaluation answer templates ─────────────────────────────────────────
// Used when the attendee has named specific tools and the trainee asks a
// concrete question about their stack.  Templates use {toolA}/{toolB} placeholders
// filled from session.currentTools.

const STACK_EVAL_TEMPLATES: Array<(toolA: string, toolB: string) => string> = [
  (a, b) => `For us, the hard part is jumping between ${a} and ${b} and trying to piece together what actually happened.`,
  (a, b) => `We can usually find the raw data in ${a}, but correlating it with what we see in ${b} is where things slow down.`,
  (a, b) => `${a} gives us part of the picture and ${b} gives us another part, but during an incident it's tough to connect them quickly.`,
  (a, b) => `The tools work fine on their own, but when something breaks we spend too much time stitching ${a} and ${b} signals together.`,
];

/** Fallback for when only one tool is known */
const STACK_EVAL_SINGLE: Array<(tool: string) => string> = [
  (t) => `We're using ${t}, but when incidents hit the data is hard to navigate quickly.`,
  (t) => `${t} gives us the raw data, but correlating signals during an incident is still really manual.`,
  (t) => `Honestly, ${t} works okay day-to-day, but under pressure during an incident it slows us down.`,
  (t) => `The biggest gap with ${t} is connecting what we see there to what's actually happening across our services.`,
];

/**
 * Capitalize the first letter of a tool name for use at sentence start.
 */
function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Generate a concrete first-person answer about the attendee's current stack.
 * Returns null if no tools are available on the session.
 */
function generateStackEvalAnswer(
  session: SessionState,
  traineeTurnCount: number
): string | null {
  const tools = (session as any).currentTools as string[] | undefined;
  if (!tools || tools.length === 0) return null;

  if (tools.length >= 2) {
    const idx = traineeTurnCount % STACK_EVAL_TEMPLATES.length;
    const toolA = capitalizeFirst(tools[0]);
    const toolB = capitalizeFirst(tools[1]);
    return STACK_EVAL_TEMPLATES[idx](toolA, toolB);
  }

  const idx = traineeTurnCount % STACK_EVAL_SINGLE.length;
  return STACK_EVAL_SINGLE[idx](capitalizeFirst(tools[0]));
}

// ── Answer move — first-person response templates ────────────────────────────

/**
 * Wrappers that make a pain statement sound like a natural answer to a question.
 * Each takes the formatted pain statement and prepends a conversational opener.
 */
const ANSWER_WRAPPERS: Array<(statement: string) => string> = [
  (s) => `Yeah, ${s.charAt(0).toLowerCase()}${s.slice(1)}`,
  (s) => `For us, ${s.charAt(0).toLowerCase()}${s.slice(1)}`,
  (s) => `Honestly, ${s.charAt(0).toLowerCase()}${s.slice(1)}`,
  (s) => `On our end, ${s.charAt(0).toLowerCase()}${s.slice(1)}`,
  (s) => `Right now, ${s.charAt(0).toLowerCase()}${s.slice(1)}`,
];

/**
 * Generic first-person answers when no pain anchors are available.
 * Used as fallback for the answer move ONLY when the trainee did NOT ask a question.
 */
const GENERIC_FIRST_PERSON_ANSWERS: string[] = [
  "For us, the biggest challenge has been the debugging cycles during incidents.",
  "On our end, we've been struggling with alert noise and on-call fatigue.",
  "Honestly, our monitoring setup is pretty fragmented right now.",
  "For our team, incident response is still really manual and slow.",
  "Right now we're dealing with a lot of toil around deployments and rollbacks.",
];

// ── Answer contract — question-type routing ───────────────────────────────────
// When the trainee asks a direct question, the answer case MUST route to a
// question-relevant template.  Generic pain anchors are NOT surfaced unless
// they directly match the question keywords.

/**
 * Hard-priority tool-enumeration detector.
 * Only matches questions that are clearly asking WHAT tools the attendee uses —
 * NOT "how is your monitoring working" or "where does it break".
 * Must fire BEFORE pain-detail routing to avoid the wrong template bank.
 */
const TOOL_ENUM_Q_RE =
  /\b(what (tool|tools)\b|what (are|were) (you|your) (using|running|relying)\b|what'?s in (the|that|your|our) (mix|stack|setup)\b|what does (your|the) (stack|setup|tooling)\b|what (do|did) you (use|run|rely)\b|what are you using (for|alongside|with)\b)/i;

/** Detects tool / stack questions used as fallback in the existing routing block. */
const TOOL_Q_RE =
  /\b(tool|tools|stack|use|using|rely|setup|running|platform|software|solution)\b/i;

/** Detects process / workflow questions: "How do you debug?", "How does your workflow look?" */
const PROCESS_Q_RE =
  /\b(how|workflow|approach|handle|process|practice|normally|usually|debug|debugging)\b/i;

/** Detects pain-detail questions: "Where does it break?", "What's the slowdown?" */
const PAIN_DETAIL_Q_RE =
  /\b(where|what part|slow down|break|breakdown|biggest|hardest|struggle|bottleneck|pain point)\b/i;

// ── Tool enumeration answer templates ─────────────────────────────────────────
// Used exclusively when the trainee asks a "what tools are you using?" question.
// Must enumerate tool names — no pain/breakdown language.

/** Pure tool enumeration: "What tools are you using?" */
const TOOL_ENUM_TEMPLATES: Array<(tools: string) => string> = [
  (t) => `We're using ${t} right now.`,
  (t) => `Right now it's mostly ${t}.`,
  (t) => `Our stack is mainly ${t}.`,
  (t) => `We've got ${t} in the mix today.`,
];

/** Tool enumeration with usage context: "What are you using alongside X during incidents?" */
const TOOL_ENUM_WITH_CONTEXT_TEMPLATES: Array<(tools: string) => string> = [
  (t) => `We're using ${t}, and during incidents we're usually bouncing between them.`,
  (t) => `Right now it's ${t}, which works okay until we have to correlate everything under pressure.`,
  (t) => `Our setup is mostly ${t}, but during incidents it can be a lot of context switching.`,
  (t) => `We rely on ${t} — works fine day-to-day but when something breaks it can be a mess to navigate.`,
];

/**
 * Display-name overrides for tools where capitalizeFirst gives wrong output.
 * Used when rendering session.currentTools (stored lowercase from detectNamedTools).
 */
const TOOL_DISPLAY_NAMES: Record<string, string> = {
  elk:          "ELK",
  elasticsearch: "Elasticsearch",
  "new relic":  "New Relic",
  cloudwatch:   "CloudWatch",
  pagerduty:    "PagerDuty",
  sumologic:    "Sumo Logic",
  "gitlab ci":  "GitLab CI",
};

function formatToolName(tool: string): string {
  const lower = tool.toLowerCase();
  return TOOL_DISPLAY_NAMES[lower] ?? capitalizeFirst(tool);
}

/**
 * Format an array of tool names into a natural English list.
 * ["ELK"] → "ELK"
 * ["ELK", "Prometheus"] → "ELK and Prometheus"
 * ["ELK", "Prometheus", "PagerDuty"] → "ELK, Prometheus, and PagerDuty"
 */
function buildToolList(tools: string[]): string {
  if (tools.length === 0) return "a few tools";
  if (tools.length === 1) return tools[0];
  if (tools.length === 2) return `${tools[0]} and ${tools[1]}`;
  return `${tools.slice(0, -1).join(", ")}, and ${tools[tools.length - 1]}`;
}

/**
 * Select TOOL_ENUM or TOOL_ENUM_WITH_CONTEXT template and fill in the tool list.
 */
function formatToolEnumAnswer(
  tools: string[],
  wantsContext: boolean,
  traineeTurnCount: number
): string {
  const toolList = buildToolList(tools);
  if (wantsContext) {
    const idx = traineeTurnCount % TOOL_ENUM_WITH_CONTEXT_TEMPLATES.length;
    return TOOL_ENUM_WITH_CONTEXT_TEMPLATES[idx](toolList);
  }
  const idx = traineeTurnCount % TOOL_ENUM_TEMPLATES.length;
  return TOOL_ENUM_TEMPLATES[idx](toolList);
}

/**
 * Generate a concrete tool-enumeration answer.
 *
 * Priority:
 *  1. persona.toolStackOptions — deterministic by traineeTurnCount.
 *     If the trainee already mentioned a specific tool, prefer a stack option
 *     that contains that tool.
 *  2. session.currentTools — built from what the attendee has mentioned so far.
 *  3. Returns null → caller uses TOOL_ANSWER_GENERIC concrete-named fallback.
 */
function generateExplicitToolAnswer(
  traineeText: string,
  session: SessionState,
  persona: Persona | undefined,
  traineeTurnCount: number
): string | null {
  // Detect context modifier: alongside/incident/pressure → use with-context templates
  const wantsContext =
    /\b(alongside|during|when|under|incident|incidents|in the mix|under pressure)\b/i.test(traineeText);

  // Which tools the trainee already named (for preferred-stack matching)
  const mentionedTools = detectNamedTools(traineeText);

  // ── Priority 1: persona.toolStackOptions ──────────────────────────────────
  if (persona?.toolStackOptions && persona.toolStackOptions.length > 0) {
    let selectedStack = persona.toolStackOptions[traineeTurnCount % persona.toolStackOptions.length];

    // Prefer a stack option that contains a tool the trainee already mentioned
    if (mentionedTools.length > 0) {
      const matching = persona.toolStackOptions.find((opt) =>
        opt.tools.some((t) =>
          mentionedTools.some(
            (mt) => t.toLowerCase().includes(mt) || mt.includes(t.toLowerCase())
          )
        )
      );
      if (matching) selectedStack = matching;
    }

    return formatToolEnumAnswer(selectedStack.tools, wantsContext, traineeTurnCount);
  }

  // ── Priority 2: session.currentTools ──────────────────────────────────────
  if (session.currentTools && session.currentTools.length > 0) {
    const displayTools = session.currentTools.map(formatToolName);
    return formatToolEnumAnswer(displayTools, wantsContext, traineeTurnCount);
  }

  // ── Priority 3: null → caller will use TOOL_ANSWER_GENERIC ────────────────
  return null;
}

/**
 * Answers for tool-name questions when session.currentTools is known (legacy path).
 * Takes a formatted tool list string (e.g. "Splunk and Prometheus").
 */
const TOOL_NAME_ANSWERS: Array<(tools: string) => string> = [
  (t) => `Right now we're mostly using ${t}.`,
  (t) => `We're running ${t} for the main stuff.`,
  (t) => `Our stack is mostly ${t} right now.`,
  (t) => `We rely on ${t} day-to-day.`,
];

/** Generic tool-answer fallbacks when no named tools are on the session. */
const TOOL_ANSWER_GENERIC: string[] = [
  "We're using ELK for logs, Prometheus for metrics, and PagerDuty for alerting.",
  "Right now it's a mix — logs in ELK, metrics in Prometheus, and alerts through PagerDuty.",
  "We've got logs in ELK, monitoring in Grafana and Prometheus, and alerts routed through PagerDuty.",
  "Mostly ELK and Prometheus, with PagerDuty handling the alerting side.",
];

/** Process / workflow question answers. */
const PROCESS_ANSWER_TEMPLATES: string[] = [
  "We usually start with logs and then try to trace things from there.",
  "When something breaks, we check dashboards first and then dig into logs if we need more context.",
  "Our usual approach is to look at what fired the alert and then work backward from there.",
  "Honestly it's a bit manual — we start with whatever triggered and try to correlate from there.",
];

/** Pain-detail question answers. */
const PAIN_DETAIL_ANSWERS: string[] = [
  "The slowdown is usually in figuring out which service is actually causing the issue.",
  "The biggest gap is connecting signals across services — we can find the data but correlating it takes time.",
  "Where it breaks down is during actual incidents — the data is there but it's scattered.",
  "The hardest part is understanding what caused what — we can see symptoms but root cause takes forever.",
];

/**
 * Hard fallback for answer-mode questions that didn't match a specific type.
 * NEVER falls back to unrelated pain.
 */
const ANSWER_HARD_FALLBACK: string[] = [
  "Right now we're mostly relying on a mix of tools and it's a bit fragmented.",
  "We usually start with logs and then try to trace things from there.",
  "The slowdown is usually in figuring out which service is actually causing the issue.",
  "Honestly our setup works okay day-to-day but under pressure it slows us down.",
];

/**
 * Format tool names from the session into a readable list.
 * Returns null if no tools are on the session.
 */
function formatToolNames(session: SessionState): string | null {
  const tools = session.currentTools;
  if (!tools || tools.length === 0) return null;
  if (tools.length === 1) return capitalizeFirst(tools[0]);
  return `${capitalizeFirst(tools[0])} and ${capitalizeFirst(tools[1])}`;
}

// ── Helper: pick unused phrase avoiding recent attendee repetition ─────────────

function pickUnused(
  bank: string[],
  recentAttendeeText: string,
  fallbackIndex: number
): string {
  const unused = bank.filter(
    (p) => !recentAttendeeText.includes(p.toLowerCase().slice(0, 30))
  );
  return unused.length > 0 ? unused[0] : bank[fallbackIndex % bank.length];
}

// ── Pain anchor helpers ───────────────────────────────────────────────────────

function formatPainAsStatement(pain: string): string {
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

  if (statement === pain && pain.startsWith("How ")) {
    statement = pain
      .replace(/^How /, "We need to figure out how to ")
      .replace(/\?$/, ".");
  }

  return statement;
}

function hasAlreadySurfacedPain(
  session: SessionState,
  pain: { id: string }
): boolean {
  const surfacedPains = (session as any).surfacedPainIds || [];
  return surfacedPains.includes(pain.id);
}

function markPainAsSurfaced(session: SessionState, painId: string): void {
  if (!(session as any).surfacedPainIds) {
    (session as any).surfacedPainIds = [];
  }
  (session as any).surfacedPainIds.push(painId);
}

function matchPersonaQuestion(
  traineeText: string,
  persona: Persona
): { question: string; category: string } | null {
  if (!persona.questionBank || persona.questionBank.length === 0) return null;

  const lowerText = traineeText.toLowerCase();
  const words = lowerText.split(/\s+/);

  const matches = persona.questionBank
    .map((q) => {
      const contextWords = q.triggerContext?.toLowerCase().split(/\s+/) || [];
      const questionWords = q.question.toLowerCase().split(/\s+/);
      const allKeywords = [...contextWords, ...questionWords];
      const matchCount = allKeywords.filter((kw) =>
        words.some((w) => w.includes(kw) || kw.includes(w))
      ).length;
      return { question: q, matchCount };
    })
    .filter((m) => m.matchCount >= 2);

  if (matches.length === 0) return null;

  matches.sort((a, b) => b.matchCount - a.matchCount);
  const selected = matches[0].question;
  return { question: selected.question, category: selected.category };
}

function matchPersonaPain(
  traineeText: string,
  persona: Persona
): { pain: string; painId: string; priority: string } | null {
  if (!persona.painAnchors || persona.painAnchors.length === 0) return null;

  const lowerText = traineeText.toLowerCase();

  const matches = persona.painAnchors
    .map((p) => {
      const matchCount = p.keywords.filter((kw) =>
        lowerText.includes(kw.toLowerCase())
      ).length;
      return { pain: p, matchCount };
    })
    .filter((m) => m.matchCount >= 2);

  if (matches.length === 0) return null;

  const primaryMatches = matches.filter((m) => m.pain.priority === "primary");
  const selectedMatches = primaryMatches.length > 0 ? primaryMatches : matches;
  selectedMatches.sort((a, b) => b.matchCount - a.matchCount);
  const selected = selectedMatches[0].pain;
  return {
    pain: selected.pain,
    painId: selected.id,
    priority: selected.priority,
  };
}

// ── Topic-aware pain anchor sorting ──────────────────────────────────────────

/**
 * Sort pain anchors so that on-topic anchors come first.
 * Off-topic anchors are pushed to the back but not removed, so fallback
 * still works when no on-topic anchors remain unsurfaced.
 */
function sortPainAnchorsByTopic<
  T extends { keywords: string[]; priority: string }
>(anchors: T[], currentTopic: string | null): T[] {
  if (!currentTopic) return anchors;
  return [...anchors].sort((a, b) => {
    const aOnTopic = isPainAnchorOnTopic(a.keywords, currentTopic) ? 0 : 1;
    const bOnTopic = isPainAnchorOnTopic(b.keywords, currentTopic) ? 0 : 1;
    if (aOnTopic !== bOnTopic) return aOnTopic - bOnTopic;
    // Within same on/off-topic group, prefer primary
    const aPrimary = a.priority === "primary" ? 0 : 1;
    const bPrimary = b.priority === "primary" ? 0 : 1;
    return aPrimary - bPrimary;
  });
}

// ── Loop detection (kept from original) ──────────────────────────────────────

function isRepetitiveResponse(
  candidateText: string,
  session: SessionState
): boolean {
  const recentAttendeeMessages = session.transcript
    .filter((m) => m.type === "attendee")
    .slice(-3)
    .map((m) => m.text.toLowerCase().trim());

  if (recentAttendeeMessages.length === 0) return false;

  const candidateLower = candidateText.toLowerCase().trim();

  if (recentAttendeeMessages.includes(candidateLower)) return true;

  for (const recentMsg of recentAttendeeMessages) {
    const longerLength = Math.max(candidateLower.length, recentMsg.length);
    const shorterLength = Math.min(candidateLower.length, recentMsg.length);
    if (
      (candidateLower.includes(recentMsg) ||
        recentMsg.includes(candidateLower)) &&
      shorterLength / longerLength > 0.9
    ) {
      return true;
    }
  }

  return false;
}

function getWrapUpQuestion(persona: Persona, session: SessionState): string {
  const wrapUpOptions = [
    "Is there a free tier we could try?",
    "Do you have documentation I can review?",
    "Can you scan my badge for follow-up?",
    "What's the pricing model?",
    "Can you show me a quick demo?",
    "How hard is the rollout? We're pretty lean on bandwidth.",
  ];

  const recentText = session.transcript
    .filter((m) => m.type === "attendee")
    .slice(-5)
    .map((m) => m.text.toLowerCase())
    .join(" ");

  const unused = wrapUpOptions.filter(
    (q) => !recentText.includes(q.toLowerCase())
  );

  if (unused.length > 0) return unused[0];
  return wrapUpOptions[Math.floor(Math.random() * wrapUpOptions.length)];
}

// ── Director-driven content generation ───────────────────────────────────────

/**
 * Picks attendee reply content that matches the directive's move type.
 * Returns null only when move === "share_pain" and no pain anchors exist
 * (in which case the caller triggers LLM fallback).
 */
function generateFromDirective(
  directive: DirectorDirective,
  traineeText: string,
  session: SessionState,
  persona: Persona | undefined,
  traineeTurnCount: number,
  isTraineeQuestion: boolean
): AttendeeReplyResult | null {
  const { move } = directive;

  const recentAttendeeText = session.transcript
    .filter((m) => m.type === "attendee")
    .slice(-5)
    .map((m) => m.text.toLowerCase())
    .join(" ");

  switch (move) {
    case "share_pain": {
      const targetPainId = directive.mustInclude?.painAnchorId;
      let painText: string | null = null;
      let painId: string | null = null;

      // 1. Use specifically directed pain anchor
      if (targetPainId && persona?.painAnchors) {
        const anchor = persona.painAnchors.find((p) => p.id === targetPainId);
        if (anchor && !hasAlreadySurfacedPain(session, anchor)) {
          painText = formatPainAsStatement(anchor.pain);
          painId = anchor.id;
        }
      }

      // 2. Keyword-match pain on trainee text
      if (!painText && persona?.painAnchors) {
        const matched = matchPersonaPain(traineeText, persona);
        if (matched && !hasAlreadySurfacedPain(session, { id: matched.painId })) {
          painText = formatPainAsStatement(matched.pain);
          painId = matched.painId;
        }
      }

      // 3. Next unsurfaced pain anchor (topic-aware: prefer on-topic)
      if (!painText && persona?.painAnchors) {
        const unsurfaced = persona.painAnchors.filter(
          (p) => !hasAlreadySurfacedPain(session, p)
        );
        const sorted = sortPainAnchorsByTopic(unsurfaced, session.currentTopic ?? null);
        if (sorted.length > 0) {
          painText = formatPainAsStatement(sorted[0].pain);
          painId = sorted[0].id;
        }
      }

      if (painText && painId) {
        markPainAsSurfaced(session, painId);
        const sanitized = persona
          ? sanitizeResponse(painText, persona)
          : painText;
        recordDirectorMove(session, move);
        return {
          text: postProcessAttendeeText(sanitized, persona),
          source: "persona_pain",
          confidence: 0.9,
        };
      }

      // No pain content available — fall through to LLM
      return null;
    }

    case "ask_hook": {
      // Safety net: if the attendee has already spoken, ask_hook should not
      // produce another neutral question.  Return a light context + pivot
      // to prevent question-looping regression.
      const hookAttendeeCount = session.transcript.filter(
        (m) => m.type === "attendee"
      ).length;
      if (hookAttendeeCount > 0) {
        const HOOK_PIVOTS = [
          "Pretty good so far — I'm mostly checking out observability tools. What kinds of folks have you been talking to today?",
          "Yeah, it's been a good conference — I'm looking at monitoring and reliability tools. What's the product about?",
          "Doing well — we're evaluating some options for our incident workflow. Tell me more about what you do here.",
        ];
        const pivotText =
          HOOK_PIVOTS[traineeTurnCount % HOOK_PIVOTS.length];
        recordDirectorMove(session, move);
        return {
          text: postProcessAttendeeText(pivotText, persona),
          source: "template",
          confidence: 0.85,
        };
      }
      // First-turn hook: use hookOverride or neutral hook bank
      const hookText =
        directive.hookOverride ??
        NEUTRAL_HOOK_BANK[traineeTurnCount % NEUTRAL_HOOK_BANK.length];
      recordDirectorMove(session, move);
      return {
        text: postProcessAttendeeText(hookText, persona),
        source: "template",
        confidence: 0.9,
      };
    }

    case "answer": {
      // Small-talk fast path: casual 1-sentence answer + optional pivot
      if (directive.smallTalk) {
        const nonSystem = session.transcript.filter((m) => m.type !== "system");
        const stIdx = nonSystem.length % SMALL_TALK_ANSWERS.length;
        let smallTalkText = SMALL_TALK_ANSWERS[stIdx];
        // Append a gentle pivot unless attendee intent is hard_exit
        if (directive.intent !== "hard_exit") {
          const pivotIdx = nonSystem.length % SMALL_TALK_PIVOTS.length;
          smallTalkText += " " + SMALL_TALK_PIVOTS[pivotIdx];
        }
        recordDirectorMove(session, move);
        return {
          text: postProcessAttendeeText(smallTalkText, persona),
          source: "template",
          confidence: 0.9,
        };
      }

      // ── Tool-enumeration hard priority fast path ──────────────────────────
      // Must fire BEFORE toolAnchored and BEFORE pain-detail routing.
      // "What are you using alongside ELK?" → must name tools, not describe pain.
      if (isTraineeQuestion && TOOL_ENUM_Q_RE.test(traineeText)) {
        const explicitAnswer = generateExplicitToolAnswer(
          traineeText, session, persona, traineeTurnCount
        );
        // If no persona/session tools, use the concrete named-tool generic bank
        const toolAnswer = explicitAnswer
          ?? pickUnused(TOOL_ANSWER_GENERIC, recentAttendeeText, traineeTurnCount);
        const sanitized = persona ? sanitizeResponse(toolAnswer, persona) : toolAnswer;
        recordDirectorMove(session, move);
        const replyText = postProcessAttendeeText(sanitized, persona);
        console.log("[ANSWER MODE: TOOL]", { traineeQuestion: traineeText, generated: replyText });
        return {
          text: replyText,
          source: "template",
          confidence: 0.95,
        };
      }

      // Tool-anchored fast path: concrete first-person answer about the
      // attendee's named tools instead of generic pain anchors.
      if (directive.toolAnchored) {
        const stackAnswer = generateStackEvalAnswer(session, traineeTurnCount);
        if (stackAnswer) {
          const sanitized = persona
            ? sanitizeResponse(stackAnswer, persona)
            : stackAnswer;
          recordDirectorMove(session, move);
          const replyText = postProcessAttendeeText(sanitized, persona);
          return {
            text: replyText,
            source: "template",
            confidence: 0.9,
          };
        }
        // Fall through to question-type routing if no tools available
      }

      // ── Answer contract: when the trainee asked a direct question, route
      // by question type.  Generic pain anchors are NEVER used here — they
      // cause unrelated pain statements to appear as answers.
      // e.g. "What tools do you use?" → "We're using X" not "Alert noise is terrible."
      if (isTraineeQuestion) {
        let questionAnswer: string | null = null;

        // Priority: pain-detail (most specific) → tool → process
        if (PAIN_DETAIL_Q_RE.test(traineeText)) {
          const idx = traineeTurnCount % PAIN_DETAIL_ANSWERS.length;
          questionAnswer = pickUnused(PAIN_DETAIL_ANSWERS, recentAttendeeText, idx);
        } else if (TOOL_Q_RE.test(traineeText)) {
          // Use named tools if available, otherwise generic tool answer
          const toolList = formatToolNames(session);
          if (toolList) {
            const idx = traineeTurnCount % TOOL_NAME_ANSWERS.length;
            questionAnswer = TOOL_NAME_ANSWERS[idx](toolList);
          } else {
            questionAnswer = pickUnused(TOOL_ANSWER_GENERIC, recentAttendeeText, traineeTurnCount);
          }
        } else if (PROCESS_Q_RE.test(traineeText)) {
          questionAnswer = pickUnused(PROCESS_ANSWER_TEMPLATES, recentAttendeeText, traineeTurnCount);
        }

        // Hard fallback: still answer the question, never fall through to pain anchors
        if (!questionAnswer) {
          questionAnswer = pickUnused(ANSWER_HARD_FALLBACK, recentAttendeeText, traineeTurnCount);
        }

        const sanitized = persona ? sanitizeResponse(questionAnswer, persona) : questionAnswer;
        recordDirectorMove(session, move);
        const replyText = postProcessAttendeeText(sanitized, persona);
        return {
          text: replyText,
          source: "template",
          confidence: 0.85,
        };
      }

      // ── Non-question path: attendee was asked to elaborate/share context.
      // Pain anchors are allowed here since the trainee didn't ask a specific question.
      // Step 3 (any unsurfaced anchor) is intentionally REMOVED — use only anchors
      // that match what the trainee is talking about.

      let answerText: string | null = null;
      let answerPainId: string | null = null;

      // 1. Keyword-match pain on trainee text (anchored to trainee's topic)
      if (persona?.painAnchors) {
        const matched = matchPersonaPain(traineeText, persona);
        if (matched && !hasAlreadySurfacedPain(session, { id: matched.painId })) {
          answerText = formatPainAsStatement(matched.pain);
          answerPainId = matched.painId;
        }
      }

      // 2. Specifically directed pain anchor from the director
      if (!answerText && directive.mustInclude?.painAnchorId && persona?.painAnchors) {
        const anchor = persona.painAnchors.find(
          (p) => p.id === directive.mustInclude!.painAnchorId
        );
        if (anchor && !hasAlreadySurfacedPain(session, anchor)) {
          answerText = formatPainAsStatement(anchor.pain);
          answerPainId = anchor.id;
        }
      }

      // Wrap with a conversational opener
      if (answerText && answerPainId) {
        markPainAsSurfaced(session, answerPainId);
        const wrapperIdx = traineeTurnCount % ANSWER_WRAPPERS.length;
        let wrapped = ANSWER_WRAPPERS[wrapperIdx](answerText);
        if (wrapped.endsWith("?")) {
          wrapped = wrapped.slice(0, -1) + ".";
        }
        const sanitized = persona ? sanitizeResponse(wrapped, persona) : wrapped;
        recordDirectorMove(session, move);
        const replyText = postProcessAttendeeText(sanitized, persona);
        return {
          text: replyText,
          source: "persona_pain",
          confidence: 0.85,
        };
      }

      // Fallback: generic first-person answers (only reached for non-question turns)
      const chosen = pickUnused(
        GENERIC_FIRST_PERSON_ANSWERS,
        recentAttendeeText,
        traineeTurnCount
      );
      recordDirectorMove(session, move);
      const fallbackText = postProcessAttendeeText(chosen, persona);
      return {
        text: fallbackText,
        source: "template",
        confidence: 0.75,
      };
    }

    case "ask_clarifying": {
      // 1. Try persona question bank for a contextual match
      if (persona?.questionBank) {
        const matched = matchPersonaQuestion(traineeText, persona);
        if (matched) {
          const sanitized = persona
            ? sanitizeResponse(matched.question, persona)
            : matched.question;
          recordDirectorMove(session, move);
          return {
            text: postProcessAttendeeText(sanitized, persona),
            source: "persona_question",
            confidence: 0.85,
          };
        }
      }

      // 2. Cooperative clarifiers — keyword-templated when possible
      const lastAttendee =
        session.transcript
          .filter((m) => m.type === "attendee")
          .at(-1)?.text ?? "";
      const clarifyTerms = extractKeyPhrases(traineeText + " " + lastAttendee);

      if (clarifyTerms.length > 0) {
        const term = clarifyTerms[0];
        const idx = traineeTurnCount % COOPERATIVE_CLARIFIERS.length;
        const candidate = COOPERATIVE_CLARIFIERS[idx](term);
        // Check for repetition
        if (!recentAttendeeText.includes(candidate.toLowerCase().slice(0, 30))) {
          recordDirectorMove(session, move);
          return {
            text: postProcessAttendeeText(candidate, persona),
            source: "persona_question",
            confidence: 0.8,
          };
        }
      }

      // 3. Generic cooperative fallback
      const genIdx = traineeTurnCount % GENERIC_COOPERATIVE_CLARIFIERS.length;
      const generic = GENERIC_COOPERATIVE_CLARIFIERS[genIdx];
      recordDirectorMove(session, move);
      return {
        text: postProcessAttendeeText(generic, persona),
        source: "persona_question",
        confidence: 0.75,
      };
    }

    case "ask_demo": {
      // Safety net: solution must be introduced before asking for a demo
      if (!session.solutionIntroduced) {
        const fallback = pickUnused(GENERIC_FIRST_PERSON_ANSWERS, recentAttendeeText, traineeTurnCount);
        recordDirectorMove(session, "share_pain");
        return { text: postProcessAttendeeText(fallback, persona), source: "template", confidence: 0.7 };
      }
      const chosen = pickUnused(
        DEMO_PHRASES,
        recentAttendeeText,
        traineeTurnCount
      );
      recordDirectorMove(session, move);
      return {
        text: postProcessAttendeeText(chosen, persona),
        source: "template",
        confidence: 0.9,
      };
    }

    case "ask_docs": {
      // Safety net: solution must be introduced before asking for docs
      if (!session.solutionIntroduced) {
        const fallback = pickUnused(GENERIC_FIRST_PERSON_ANSWERS, recentAttendeeText, traineeTurnCount);
        recordDirectorMove(session, "share_pain");
        return { text: postProcessAttendeeText(fallback, persona), source: "template", confidence: 0.7 };
      }
      const chosen = pickUnused(
        DOCS_PHRASES,
        recentAttendeeText,
        traineeTurnCount
      );
      recordDirectorMove(session, move);
      return {
        text: postProcessAttendeeText(chosen, persona),
        source: "template",
        confidence: 0.9,
      };
    }

    case "ask_rollout_effort": {
      // Try persona objection bank (effort type) first
      if (persona?.objectionBank) {
        const effortObjections = persona.objectionBank.filter(
          (o) => o.type === "effort"
        );
        if (effortObjections.length > 0) {
          const idx = traineeTurnCount % effortObjections.length;
          const sanitized = persona
            ? sanitizeResponse(effortObjections[idx].objection, persona)
            : effortObjections[idx].objection;
          recordDirectorMove(session, move);
          return {
            text: postProcessAttendeeText(sanitized, persona),
            source: "persona_objection",
            confidence: 0.9,
          };
        }
      }
      const chosen = pickUnused(
        ROLLOUT_PHRASES,
        recentAttendeeText,
        traineeTurnCount
      );
      recordDirectorMove(session, move);
      return {
        text: postProcessAttendeeText(chosen, persona),
        source: "template",
        confidence: 0.85,
      };
    }

    case "ask_pricing": {
      // Try persona objection bank (cost type) first
      if (persona?.objectionBank) {
        const costObjections = persona.objectionBank.filter(
          (o) => o.type === "cost"
        );
        if (costObjections.length > 0) {
          const idx = traineeTurnCount % costObjections.length;
          const sanitized = persona
            ? sanitizeResponse(costObjections[idx].objection, persona)
            : costObjections[idx].objection;
          recordDirectorMove(session, move);
          return {
            text: postProcessAttendeeText(sanitized, persona),
            source: "persona_objection",
            confidence: 0.9,
          };
        }
      }
      const chosen = pickUnused(
        PRICING_PHRASES,
        recentAttendeeText,
        traineeTurnCount
      );
      recordDirectorMove(session, move);
      return {
        text: postProcessAttendeeText(chosen, persona),
        source: "template",
        confidence: 0.85,
      };
    }

    case "ask_badge": {
      // Safety net: solution must be introduced before asking for badge scan
      if (!session.solutionIntroduced) {
        const fallback = pickUnused(GENERIC_FIRST_PERSON_ANSWERS, recentAttendeeText, traineeTurnCount);
        recordDirectorMove(session, "share_pain");
        return { text: postProcessAttendeeText(fallback, persona), source: "template", confidence: 0.7 };
      }
      const chosen = pickUnused(
        BADGE_PHRASES,
        recentAttendeeText,
        traineeTurnCount
      );
      recordDirectorMove(session, move);
      return {
        text: postProcessAttendeeText(chosen, persona),
        source: "template",
        confidence: 0.9,
      };
    }

    case "deflect": {
      const chosen = DEFLECT_PHRASES[traineeTurnCount % DEFLECT_PHRASES.length];
      recordDirectorMove(session, move);
      return {
        text: postProcessAttendeeText(chosen, persona),
        source: "template",
        confidence: 0.8,
      };
    }

    case "exit": {
      const chosen = EXIT_PHRASES[traineeTurnCount % EXIT_PHRASES.length];
      recordDirectorMove(session, move);
      return {
        text: postProcessAttendeeText(chosen, persona),
        source: "template",
        confidence: 0.8,
      };
    }

    case "booth_entry": {
      const entryMode = (directive.boothEntryMode ?? "market_scan") as BoothEntryMode;
      const entryText = pickBoothEntryResponse(entryMode, persona, traineeTurnCount);
      recordDirectorMove(session, move);
      console.log("[BOOTH ENTRY]", { mode: entryMode, generated: entryText });
      return {
        text: postProcessAttendeeText(entryText, persona),
        source: "template",
        confidence: 0.9,
      };
    }
  }

  // TypeScript exhaustiveness guard — should never reach here
  return null;
}

// ── Internal generator ────────────────────────────────────────────────────────

function generateAttendeeReplyInternal(params: {
  traineeText: string;
  session: SessionState;
  traineeTurnCount: number;
}): AttendeeReplyResult | null {
  const { traineeText, session, traineeTurnCount } = params;
  const persona = (session as any).persona as Persona | undefined;

  // 1. Ask the director what the attendee should do next
  const directive = decideNextMove(session, persona, traineeText);

  // 2. Store directive on session so the message route can inject the LLM hint
  (session as any).currentDirective = directive;

  // 3. Update topic memory — track what the trainee is talking about
  //    (runs before content generation so topic-aware pain filtering uses fresh state,
  //     and runs even when generateFromDirective returns null for LLM fallback)
  {
    const topicUpdate = resolveTopicUpdate(
      traineeText,
      session.currentTopic ?? null,
      session.consecutiveNewTopicCount ?? 0
    );
    session.currentTopic = topicUpdate.topic ?? undefined;
    session.consecutiveNewTopicCount = topicUpdate.consecutiveNewTopicCount;
  }

  // 3b. Update tool memory — scan attendee messages for named tools
  //     and persist to session.currentTools so the director can reference them.
  {
    const attendeeMsgs = session.transcript.filter((m) => m.type === "attendee");
    const allAttendeeText = attendeeMsgs.map((m) => m.text).join(" ");
    const detectedTools = detectNamedTools(allAttendeeText);
    if (detectedTools.length > 0) {
      // Merge with existing tools (deduplicated, preserving order)
      const existing = session.currentTools ?? [];
      const merged = [...existing];
      for (const t of detectedTools) {
        if (!merged.includes(t)) merged.push(t);
      }
      session.currentTools = merged;
    }
  }

  // 3c. Solution detection — gate evaluation moves until the trainee introduces
  //     the product or a concrete capability.  Once set it is never unset.
  if (!session.solutionIntroduced && detectSolutionMention(traineeText)) {
    session.solutionIntroduced = true;
  }

  // 3c2. Badge-scan CTA already happened? Once the trainee offers or performs it, the
  //       attendee must not turn around and ask for it again.
  if (!session.badgeScanOffered && isTraineeBadgeOffer(traineeText)) {
    session.badgeScanOffered = true;
  }

  // 3d. Product-explanation detection — stricter than solutionIntroduced.
  //     Requires a product-framing sentence ("Honeycomb is...", "We help teams...",
  //     "It lets you...").  Once true, gates competitor/evaluation booth questions.
  if (!session.productExplained && detectProductExplanation(traineeText)) {
    session.productExplained = true;
  }

  // 3e. Reply ownership: expressive turns go to the LLM.
  //     Measured before this gate existed: 0 of 360 sampled turns ever reached the LLM,
  //     so every reply came from a finite bank - which is why two different personas could
  //     return byte-identical pain text. Factual/scripted turns stay deterministic.
  //     Returning null here is the existing LLM handoff; the route reads
  //     session.currentDirective (set in step 2) as the generation hint.
  //     Deliberately placed AFTER every state update above (topic, tools, solution,
  //     product-explanation) so those still run on turns the LLM answers.
  if (decideReplyOwner(directive, traineeText) === "llm") {
    return null;
  }

  // 4. Generate content that matches the directive
  const isTraineeQuestion = isQuestion(traineeText);
  let result = generateFromDirective(directive, traineeText, session, persona, traineeTurnCount, isTraineeQuestion);

  if (!result) return null;

  // 5. Continuity contract — applied only to moves that benefit from a
  //    contextual bridge prefix.  Direct answers (answer, share_pain) and
  //    terminal/hook moves are excluded so persona-specific and tool-anchored
  //    content is never overwritten by a canned callback stem.
  //
  //    Allowlisted moves: ask_clarifying, ask_docs, ask_demo, ask_pricing,
  //    ask_rollout_effort.  Everything else returns the generated text as-is.
  const CONTINUITY_MOVES = new Set<DirectorMove>([
    "ask_clarifying",
    "ask_docs",
    "ask_demo",
    "ask_pricing",
    "ask_rollout_effort",
  ]);

  if (traineeText.trim().length > 0 && CONTINUITY_MOVES.has(directive.move)) {
    const lastAttendeeText =
      session.transcript
        .filter((m) => m.type === "attendee")
        .at(-1)?.text ?? "";

    const continuityText = enforceContinuity(result.text, {
      lastTraineeText: traineeText,
      lastAttendeeText,
      intent: directive.intent ?? "neutral",
      stage: directive.stage,
      move: directive.move,
      mustAvoid: directive.mustAvoid?.phrases,
      smallTalk: directive.smallTalk,
    });

    result = {
      ...result,
      text: postProcessAttendeeText(continuityText, persona),
    };
  }

  return result;
}

// ── Public wrapper (with loop detection) ─────────────────────────────────────

/**
 * Generate an attendee reply driven by the conversation director.
 *
 * Returns null when no template/bank match was found — the caller (message
 * route) should then invoke the LLM with the directive hint attached.
 */
export function generateAttendeeReply(params: {
  traineeText: string;
  session: SessionState;
  traineeTurnCount: number;
}): AttendeeReplyResult | null {
  const { session } = params;
  const persona = (session as any).persona as Persona | undefined;

  let result = generateAttendeeReplyInternal(params);

  if (!result) {
    return null; // LLM fallback — route picks up (session as any).currentDirective
  }

  // Discovery-question filter: the attendee is a prospect, not a salesperson.
  // Replace discovery questions ("How does your team…?") with:
  //   - EVALUATION_QUESTIONS if the solution has been introduced (they have context to evaluate)
  //   - GENERIC_FIRST_PERSON_ANSWERS otherwise (nothing to evaluate yet — pivot to pain sharing)
  //
  // Exempt: booth_entry moves — their questions are attendee-perspective FAQ questions
  // (e.g. "How are you different from Grafana?"), not trainee discovery probes.
  const currentMove = (session as any).currentDirective?.move as DirectorMove | undefined;
  if (isDiscoveryQuestion(result.text) && currentMove !== "booth_entry") {
    const recentAttendeeText = session.transcript
      .filter((m) => m.type === "attendee")
      .slice(-5)
      .map((m) => m.text.toLowerCase())
      .join(" ");
    const bank = session.solutionIntroduced ? EVALUATION_QUESTIONS : GENERIC_FIRST_PERSON_ANSWERS;
    const replacement = pickUnused(
      bank,
      recentAttendeeText,
      params.traineeTurnCount
    );
    result = {
      ...result,
      text: postProcessAttendeeText(replacement, persona),
    };
  }

  // Loop detection: if this text was recently used, force a different question
  if (isRepetitiveResponse(result.text, session)) {
    console.log(
      `[Director] Repetitive response detected: "${result.text.substring(0, 50)}..."`
    );
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
