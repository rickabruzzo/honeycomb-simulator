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
  NEUTRAL_HOOK_BANK,
  type DirectorDirective,
} from "./conversationDirector";
import {
  enforceContinuity,
  extractKeyPhrases,
  type ContinuityContext,
} from "./reactiveness";

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
 * Used as fallback for the answer move.
 */
const GENERIC_FIRST_PERSON_ANSWERS: string[] = [
  "For us, the biggest challenge has been the debugging cycles during incidents.",
  "On our end, we've been struggling with alert noise and on-call fatigue.",
  "Honestly, our monitoring setup is pretty fragmented right now.",
  "For our team, incident response is still really manual and slow.",
  "Right now we're dealing with a lot of toil around deployments and rollbacks.",
];

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
  traineeTurnCount: number
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

      // 3. Next unsurfaced primary pain anchor
      if (!painText && persona?.painAnchors) {
        const primary = persona.painAnchors.filter(
          (p) => p.priority === "primary" && !hasAlreadySurfacedPain(session, p)
        );
        if (primary.length > 0) {
          painText = formatPainAsStatement(primary[0].pain);
          painId = primary[0].id;
        }
      }

      // 4. Any unsurfaced pain anchor
      if (!painText && persona?.painAnchors) {
        const any = persona.painAnchors.filter(
          (p) => !hasAlreadySurfacedPain(session, p)
        );
        if (any.length > 0) {
          painText = formatPainAsStatement(any[0].pain);
          painId = any[0].id;
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

      // The attendee should answer the trainee's question with a first-person
      // statement about their own situation — NOT ask a question back.
      // This prevents role-reversal (attendee interrogating the trainee).

      let answerText: string | null = null;
      let answerPainId: string | null = null;

      // 1. Try keyword-match pain on trainee text
      if (persona?.painAnchors) {
        const matched = matchPersonaPain(traineeText, persona);
        if (matched && !hasAlreadySurfacedPain(session, { id: matched.painId })) {
          answerText = formatPainAsStatement(matched.pain);
          answerPainId = matched.painId;
        }
      }

      // 2. Try specifically directed pain anchor
      if (!answerText && directive.mustInclude?.painAnchorId && persona?.painAnchors) {
        const anchor = persona.painAnchors.find(
          (p) => p.id === directive.mustInclude!.painAnchorId
        );
        if (anchor && !hasAlreadySurfacedPain(session, anchor)) {
          answerText = formatPainAsStatement(anchor.pain);
          answerPainId = anchor.id;
        }
      }

      // 3. Next unsurfaced pain anchor
      if (!answerText && persona?.painAnchors) {
        const unsurfaced = persona.painAnchors.filter(
          (p) => !hasAlreadySurfacedPain(session, p)
        );
        const primary = unsurfaced.filter((p) => p.priority === "primary");
        const picked = primary.length > 0 ? primary[0] : unsurfaced[0];
        if (picked) {
          answerText = formatPainAsStatement(picked.pain);
          answerPainId = picked.id;
        }
      }

      // Wrap pain statement with a conversational answer opener
      if (answerText && answerPainId) {
        markPainAsSurfaced(session, answerPainId);
        const wrapperIdx = traineeTurnCount % ANSWER_WRAPPERS.length;
        let wrapped = ANSWER_WRAPPERS[wrapperIdx](answerText);
        // Role-reversal guard: ensure the response is a statement, not a question
        if (wrapped.endsWith("?")) {
          wrapped = wrapped.slice(0, -1) + ".";
        }
        const sanitized = persona ? sanitizeResponse(wrapped, persona) : wrapped;
        recordDirectorMove(session, move);
        return {
          text: postProcessAttendeeText(sanitized, persona),
          source: "persona_pain",
          confidence: 0.85,
        };
      }

      // 4. Fallback: generic first-person answers
      const chosen = pickUnused(
        GENERIC_FIRST_PERSON_ANSWERS,
        recentAttendeeText,
        traineeTurnCount
      );
      recordDirectorMove(session, move);
      return {
        text: postProcessAttendeeText(chosen, persona),
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

  // 3. Generate content that matches the directive
  let result = generateFromDirective(directive, traineeText, session, persona, traineeTurnCount);

  if (!result) return null;

  // 4. Continuity contract
  // Every reply (except ask_hook / exit) must visibly connect to the
  // conversation.  enforceContinuity checks reactiveness, strips mustAvoid
  // openers, and prepends an intent-aware callback prefix when needed.
  if (traineeText.trim().length > 0) {
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

  const result = generateAttendeeReplyInternal(params);

  if (!result) {
    return null; // LLM fallback — route picks up (session as any).currentDirective
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
