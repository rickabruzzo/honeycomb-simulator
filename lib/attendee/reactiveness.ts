/**
 * Reactiveness contract for attendee replies.
 *
 * Every generated attendee response should FEEL like a real person who
 * listened to what the trainee just said.  This module provides three
 * helpers to enforce that contract:
 *
 *  1. extractKeyPhrases(text)
 *     Pull up to 6 meaningful tokens from a string — domain terms first,
 *     then generic long non-stopwords.
 *
 *  2. makeCallbackPhrase(attendeeLast, traineeLast)
 *     Produce a deterministic "Got it — on the X side," prefix so the
 *     attendee's reply visibly echoes the trainee's last message.
 *
 *  3. isReactiveEnough(candidate, traineeLast)
 *     Returns true when the candidate reply already reflects what the
 *     trainee said (reflection marker, follow-up reference, or trainee
 *     keyphrase present).  If false, callers should prepend a callback phrase.
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

// ── makeCallbackPhrase ────────────────────────────────────────────────────────

/** Prefix templates — one is chosen deterministically by content length. */
const CALLBACK_TEMPLATES: Array<(term: string) => string> = [
  (term) => `Got it — on the ${term} side, `,
  (term) => `Right, and specifically around ${term}, `,
  (term) => `That's helpful context on the ${term} front — `,
  (term) => `Yeah, the ${term} piece is where `,
  (term) => `Understood — thinking about ${term}, `,
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
