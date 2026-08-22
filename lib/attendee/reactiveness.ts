/**
 * Reactiveness & continuity contract for attendee replies.
 *
 * Every generated attendee response should FEEL like a real person who
 * listened to what the trainee just said.  This module provides helpers
 * to enforce that contract:
 *
 *  1. extractKeyPhrases(text)
 *     Pull up to 6 meaningful tokens from a string — domain terms first,
 *     then generic long non-stopwords.
 *
 *  2. extractAnchors(text)
 *     Pull noun-phrase chunks + keywords for richer context matching.
 *
 *  3. makeCallbackPhrase(attendeeLast, traineeLast)
 *     Produce a deterministic "Got it — on the X side," prefix so the
 *     attendee's reply visibly echoes the trainee's last message.
 *
 *  4. makeContextualCallback(opts)
 *     Intent-aware callback prefix — picks from confused, bridge, or
 *     general template banks depending on conversational context.
 *
 *  5. isReactiveEnough(candidate, traineeLast)
 *     Returns true when the candidate reply already reflects what the
 *     trainee said (reflection marker, follow-up reference, or trainee
 *     keyphrase present).  If false, callers should prepend a callback phrase.
 *
 *  6. enforceContinuity(text, ctx)
 *     Single entry-point: checks reactiveness, strips mustAvoid openers,
 *     and prepends an appropriate callback prefix when needed.
 */

// ── SRE / observability domain vocabulary ────────────────────────────────────

const DOMAIN_TERMS: string[] = [
  // Core observability
  "tracing", "traces", "trace", "spans", "span",
  "metrics", "metric", "logs", "logging", "telemetry",
  "observability", "monitoring", "instrumentation",
  // Reliability / incidents
  "incident", "incidents", "outage", "outages", "postmortem", "postmortems",
  "oncall", "on-call", "pagerduty", "alerts", "alerting", "alert",
  "slo", "slos", "sla", "slas", "error-budget", "error budget",
  "mttr", "mttd", "mtta",
  // Performance
  "latency", "p99", "p95", "p50", "throughput", "bottleneck", "bottlenecks",
  "performance", "slow", "slowness", "timeout", "timeouts",
  // Dev / deploy
  "deploy", "deployment", "deployments", "pipeline", "pipelines",
  "ci/cd", "canary", "rollback", "rollout", "release",
  "kubernetes", "k8s", "containers", "microservices", "services",
  // Debug
  "debug", "debugging", "flaky", "flakiness", "root cause",
  "toil", "noise", "false positive", "false positives",
  // Data / scale
  "cardinality", "high-cardinality", "sampling", "retention",
  "ingest", "ingestion", "volume", "scale",
];

// Build a Set for O(1) lookup
const DOMAIN_TERM_SET = new Set(DOMAIN_TERMS);

// ── Patterns ──────────────────────────────────────────────────────────────────

/**
 * Phrases that indicate the speaker is directly reflecting on what was said.
 * When present in a candidate reply, it is reactive by definition.
 */
const REFLECTION_MARKERS: RegExp = /\b(sounds like|it sounds|it seems|you mentioned|you said|from what you('?re| are) (saying|describing)|when you say|the way you (put|describe)|based on what you|hearing you say|i (hear|understand) (that|you))\b/i;

/**
 * Short follow-up reference words that anchor the reply to the prior turn.
 * At least 8 words in the trainee message required to make this meaningful.
 */
const FOLLOWUP_REFERENCES: RegExp = /\b(that|this|those|what you (said|mentioned)|when you say|the way you|what you're (describing|seeing|dealing with))\b/i;

// ── Stopwords (shared with conversationDirector but kept local) ───────────────

const STOPWORDS = new Set([
  "i", "we", "you", "the", "a", "an", "is", "are", "was", "were",
  "do", "does", "can", "could", "would", "should", "to", "of", "in",
  "on", "at", "for", "with", "and", "or", "but", "so", "that", "this",
  "my", "our", "your", "it", "its", "how", "what", "when", "where",
  "why", "who", "have", "had", "has", "be", "been", "being", "will",
  "just", "not", "no", "if", "then", "than", "about", "up", "out",
  "more", "also", "well", "here", "there", "right", "like", "very",
  "get", "got", "any", "all", "by", "as", "were", "been",
]);

// ── extractKeyPhrases ─────────────────────────────────────────────────────────

/**
 * Extract up to 6 meaningful tokens from text, prioritising domain terms.
 *
 * Strategy:
 *  1. Split to lowercase words, strip punctuation.
 *  2. Collect domain terms first (in order they appear).
 *  3. Fill remaining slots with non-stopword tokens that are 4+ chars.
 *  4. Return unique list, at most 6 items.
 */
export function extractKeyPhrases(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);

  const domainHits: string[] = [];
  const genericHits: string[] = [];
  const seen = new Set<string>();

  for (const word of words) {
    if (seen.has(word)) continue;

    if (DOMAIN_TERM_SET.has(word)) {
      domainHits.push(word);
      seen.add(word);
    } else if (word.length >= 4 && !STOPWORDS.has(word)) {
      genericHits.push(word);
      seen.add(word);
    }
  }

  return [...domainHits, ...genericHits].slice(0, 6);
}

// ── extractAnchors ──────────────────────────────────────────────────────────

export interface AnchorResult {
  /** 1-3 noun-phrase-like chunks (2-5 consecutive non-stopwords) */
  phrases: string[];
  /** 3-8 meaningful single keywords (domain-first, then generic 4+ char) */
  keywords: string[];
}

/**
 * Extract both noun-phrase chunks AND single keywords from text.
 *
 * Strategy:
 *  keywords — same as extractKeyPhrases but capped at 8 instead of 6.
 *  phrases  — scan words, collect runs of consecutive non-stopword tokens
 *             (each ≥ 3 chars).  When a stopword breaks the run, if the
 *             run is 2-5 words save it as a phrase.  Cap at 3 phrases.
 */
export function extractAnchors(text: string): AnchorResult {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);

  // ── keywords (reuse extractKeyPhrases logic, cap 8) ──
  const domainHits: string[] = [];
  const genericHits: string[] = [];
  const seen = new Set<string>();

  for (const word of words) {
    if (seen.has(word)) continue;
    if (DOMAIN_TERM_SET.has(word)) {
      domainHits.push(word);
      seen.add(word);
    } else if (word.length >= 4 && !STOPWORDS.has(word)) {
      genericHits.push(word);
      seen.add(word);
    }
  }
  const keywords = [...domainHits, ...genericHits].slice(0, 8);

  // ── phrases (runs of consecutive non-stopword tokens, each ≥ 3 chars) ──
  const phrases: string[] = [];
  let run: string[] = [];

  for (const word of words) {
    if (word.length >= 3 && !STOPWORDS.has(word)) {
      run.push(word);
    } else {
      if (run.length >= 2 && run.length <= 5) {
        phrases.push(run.join(" "));
      }
      run = [];
      if (phrases.length >= 3) break;
    }
  }
  // flush trailing run
  if (run.length >= 2 && run.length <= 5 && phrases.length < 3) {
    phrases.push(run.join(" "));
  }

  return { phrases: phrases.slice(0, 3), keywords };
}

// ── makeCallbackPhrase ────────────────────────────────────────────────────────

/** Prefix templates — one is chosen deterministically by content length. */
const CALLBACK_TEMPLATES: Array<(term: string) => string> = [
  (term) => `On the ${term} side, `,
  (term) => `Around ${term}, `,
  (term) => `Yeah, the ${term} piece is where `,
  (term) => `With ${term}, `,
  (term) => `For us, the ${term} issue is `,
];

/**
 * Produce a short contextual prefix that echoes the trainee's last message.
 *
 * The phrase is deterministic — same inputs always yield the same prefix —
 * so tests can rely on it without mocking.  We pick from the template list
 * using (traineeLast.length + attendeeLast.length) % templates.length.
 *
 * If no domain term can be extracted from either message, returns an empty
 * string (the caller should fall back to prepending nothing or a plain "Right, ").
 */
export function makeCallbackPhrase(
  attendeeLast: string,
  traineeLast: string
): string {
  // Try trainee text first (respond to what THEY just said)
  const traineeTerms = extractKeyPhrases(traineeLast);
  const attendeeTerms = extractKeyPhrases(attendeeLast);

  // Domain terms from trainee preferred, then attendee, then any generic term
  const allTerms = [...traineeTerms, ...attendeeTerms];
  const domainTerm = allTerms.find((t) => DOMAIN_TERM_SET.has(t));
  const term = domainTerm ?? allTerms[0];

  if (!term) return "";

  const idx =
    (traineeLast.length + attendeeLast.length) % CALLBACK_TEMPLATES.length;
  return CALLBACK_TEMPLATES[idx](term);
}

// ── makeContextualCallback ──────────────────────────────────────────────────

/** Empathetic recovery — no scolding, no blame, no facilitator framing. */
const CONFUSED_CALLBACK_TEMPLATES: Array<(term: string) => string> = [
  (term) => `Fair point — let me come back to ${term}. `,
  (term) => `Right, so going back to the ${term} piece — `,
  (term) => `On ${term}, `,
  (term) => `Let me think about ${term} for a second. `,
  (term) => `On the ${term} side, `,
];

/** Bridge templates — simple acknowledgement before pivoting to docs/demo. */
const BRIDGE_CALLBACK_TEMPLATES: Array<(term: string) => string> = [
  (term) => `Yeah, with the ${term} situation, `,
  (term) => `Right — especially around the ${term} issues, `,
  (term) => `Given the ${term} pain, `,
  (term) => `On ${term}, `,
  (_)    => `For us it's similar — `,
];

/** General conversational callbacks — short, natural, prospect-voiced. */
const GENERAL_CALLBACK_TEMPLATES: Array<(term: string) => string> = [
  (term) => `On ${term}, `,
  (_)    => `For us, `,
  (_)    => `Usually, `,
  (term) => `Around ${term}, `,
  (_)    => `The hard part is `,
  (_)    => `What slows us down is `,
  (term) => `Yeah, the ${term} piece is where `,
  (term) => `Right — and with ${term}, `,
];

export interface ContextualCallbackOpts {
  lastTraineeText: string;
  lastAttendeeText: string;
  intent: string;
  stage: string;
}

/**
 * Intent-aware contextual callback prefix.
 *
 * Selects a template bank based on intent:
 *  - confused       → CONFUSED_CALLBACK_TEMPLATES  (empathetic, no scolding)
 *  - evaluating_fit / soft_exit → BRIDGE_CALLBACK_TEMPLATES  (pain bridge)
 *  - everything else → GENERAL_CALLBACK_TEMPLATES
 *
 * Deterministic: seed = (trainee.length + attendee.length) % bank.length.
 * Returns empty string when no term can be extracted.
 */
export function makeContextualCallback(opts: ContextualCallbackOpts): string {
  const { lastTraineeText, lastAttendeeText, intent } = opts;

  // Find best term (domain-first from trainee, then attendee, then any generic)
  const traineeTerms = extractKeyPhrases(lastTraineeText);
  const attendeeTerms = extractKeyPhrases(lastAttendeeText);
  const allTerms = [...traineeTerms, ...attendeeTerms];
  const domainTerm = allTerms.find((t) => DOMAIN_TERM_SET.has(t));
  const term = domainTerm ?? allTerms[0];

  if (!term) return "";

  // Select template bank by intent
  let bank: Array<(t: string) => string>;
  if (intent === "confused") {
    bank = CONFUSED_CALLBACK_TEMPLATES;
  } else if (intent === "evaluating_fit" || intent === "soft_exit") {
    bank = BRIDGE_CALLBACK_TEMPLATES;
  } else {
    bank = GENERAL_CALLBACK_TEMPLATES;
  }

  const seed = (lastTraineeText.length + lastAttendeeText.length) % bank.length;
  return bank[seed](term);
}

// ── isReactiveEnough ──────────────────────────────────────────────────────────

/**
 * Returns true when the candidate reply already sounds like it heard the
 * trainee's last message.
 *
 * Passes when ANY of:
 *  a. A reflection marker is present in the candidate  ("sounds like", "you mentioned", etc.)
 *  b. A follow-up reference is present AND the trainee message was substantive (8+ words)
 *  c. At least one of the trainee's key phrases appears in the candidate
 *  d. No key phrases could be extracted from the trainee text (nothing to react to)
 *
 * Note: we deliberately do NOT require (b) when traineeLast is short — short
 * confirmations ("okay", "got it") should not inflate the reactiveness bar.
 */
/**
 * First-person prospect markers — a statement opening with any of these is
 * self-grounded and reads as a genuine answer, not a scripted non-sequitur.
 * No callback prefix needed.
 */
const FIRST_PERSON_MARKERS =
  /\b(we |our |for us\b|honestly\b|usually\b|the hard part\b|what slows us down\b)/i;

export function isReactiveEnough(
  candidate: string,
  traineeLast: string
): boolean {
  // a. Reflection marker — always reactive
  if (REFLECTION_MARKERS.test(candidate)) return true;

  const traineeWords = traineeLast.trim().split(/\s+/).filter(Boolean).length;

  // Very short trainee message (≤3 words) — nothing substantive to react to;
  // any response counts as reactive (e.g. "Okay." / "Got it." / "Sure!")
  if (traineeWords <= 3) return true;

  // e. First-person prospect statement — the reply is already grounded in the
  //    attendee's own situation.  Adding a callback prefix over a statement
  //    like "We use Splunk and it's painful" turns natural speech into a
  //    scripted acknowledgement.  Only apply when there is no question mark
  //    (questions never count as self-grounded answers).
  if (!candidate.includes("?") && FIRST_PERSON_MARKERS.test(candidate)) return true;

  // b. Follow-up reference in substantive context (8+ words in trainee text)
  if (traineeWords >= 8 && FOLLOWUP_REFERENCES.test(candidate)) return true;

  // Extract trainee key phrases for term-matching
  const traineeTerms = extractKeyPhrases(traineeLast);

  // d. Nothing to react to — pass trivially
  if (traineeTerms.length === 0) return true;

  // c. At least one trainee key phrase in the candidate
  const candidateLower = candidate.toLowerCase();
  return traineeTerms.some((term) => candidateLower.includes(term));
}

// ── enforceContinuity ─────────────────────────────────────────────────────────

export interface ContinuityContext {
  lastTraineeText: string;
  lastAttendeeText: string;
  intent: string;
  stage: string;
  move: string;
  mustAvoid?: string[];
  /** When true, skip contextual callback — small-talk answers stand on their own */
  smallTalk?: boolean;
}

/**
 * Single entry-point for the continuity contract.
 *
 * Logic flow:
 *  1. Exempt: ask_hook / exit / answer / smallTalk → return text unchanged
 *  2. Already reactive? (reflection marker, keyword overlap, trivial) → unchanged
 *  3. Strip mustAvoid opener if present (re-capitalize remainder)
 *  4. Prepend contextual callback prefix (intent-aware)
 *  5. If no callback possible → return text as-is
 */
export function enforceContinuity(
  text: string,
  ctx: ContinuityContext
): string {
  const { lastTraineeText, lastAttendeeText, intent, stage, move, mustAvoid, smallTalk } = ctx;

  // 1. Exempt moves — direct answers and hooks speak for themselves.
  //    "answer" is always exempt: the attendee is responding to the trainee's
  //    question directly; prepending a callback stem turns a natural answer
  //    into a scripted acknowledgement ("Right, and with tracing, we use...").
  if (move === "ask_hook" || move === "exit" || move === "answer") return text;
  if (smallTalk) return text;

  // 2. Already reactive? No prefix needed.
  if (isReactiveEnough(text, lastTraineeText)) return text;

  // 3. Strip mustAvoid opener if text starts with a banned phrase
  let cleaned = text;
  if (mustAvoid && mustAvoid.length > 0) {
    const textLower = cleaned.toLowerCase();
    for (const phrase of mustAvoid) {
      const phraseLower = phrase.toLowerCase();
      if (textLower.startsWith(phraseLower)) {
        const remainder = cleaned.slice(phrase.length).trimStart();
        // Only strip if enough meaningful text remains
        if (remainder.length >= 10) {
          cleaned = remainder.charAt(0).toUpperCase() + remainder.slice(1);
        }
        break;
      }
    }
  }

  // 4. Generate contextual callback prefix
  const callback = makeContextualCallback({
    lastTraineeText,
    lastAttendeeText,
    intent,
    stage,
  });

  if (!callback) return cleaned;

  // Join: lowercase first char of cleaned text to flow with prefix
  return callback + cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
}
