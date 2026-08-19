/**
 * Booth entry behavior — early-turn attendee questions derived from the
 * Honeycomb Booth FAQ.  Used to make the first 1–3 attendee turns feel like
 * a real conference booth conversation instead of an immediate pain dump.
 *
 * FAQ coverage categories reflected here:
 *   - Product/observability basics (what is Honeycomb, APM, dashboards, SLOs)
 *   - Competitor comparisons (Datadog, New Relic, Grafana/Prometheus, Splunk/Elastic)
 *   - Evaluation questions (free tier, pricing, OTel, LLM observability, logs, front-end)
 *   - Market scan / browsing openers
 *   - Role-context-first openers (SRE, platform, developer, DevOps, TDM)
 */

import type { Persona } from "../scenarioTypes";
import type { SessionState } from "../storage";

// ── Booth entry mode ──────────────────────────────────────────────────────────

export type BoothEntryMode =
  | "product_question"   // "What is Honeycomb?" / "Is this APM?"
  | "competitor_question"// "So you're like Datadog?" / "How vs Grafana?"
  | "evaluation_question"// pricing / OTel / free tier / LLM / logs / front-end
  | "market_scan"        // "Just looking around" / "Checking out options"
  | "role_intro"         // "I'm an SRE" / "I work on the platform side"
  | "pain_discovery"     // trainee asked about problems → let normal director handle it
  | "none";              // attendeeCount > 2 or no booth-entry signal

// ── FAQ-derived question / statement banks ────────────────────────────────────

/**
 * Derived from FAQ: General Product Questions.
 * Covers: what is Honeycomb, observability basics, APM superset, dashboards, SLOs.
 */
export const PRODUCT_QUESTIONS: string[] = [
  "What is Honeycomb exactly?",
  "What do you all do?",
  "Is this an observability tool?",
  "Is this more like APM or something different?",
  "So what's the pitch — what problem does this solve?",
  "How does it help engineers find issues faster?",
  "What makes this different from a regular monitoring tool?",
  "Do you do dashboards, or is it something more than that?",
];

/**
 * Derived from FAQ: Competitor Questions.
 * Covers: Datadog, New Relic, Grafana, Prometheus, Splunk, Elastic, X-Ray, Sentry.
 */
export const COMPETITOR_QUESTIONS: string[] = [
  "So are you basically like Datadog?",
  "How are you different from Grafana and Prometheus?",
  "How are you different from Splunk or Elastic?",
  "What makes this different from New Relic?",
  "Is this similar to what AWS X-Ray does?",
  "How are you different from Sentry?",
  "We've been looking at Datadog — why would we consider this instead?",
  "Is this competing with Datadog, or more complementary?",
];

/**
 * Derived from FAQ: OpenTelemetry / ingest / AI / LLM / front-end / pricing.
 * Covers: free tier, OTel, LLM observability, logs, front-end, pricing model.
 */
export const EVALUATION_QUESTIONS: string[] = [
  "Do you have a free tier?",
  "Do I need OpenTelemetry to use it?",
  "Can it help with LLM systems?",
  "How does pricing work?",
  "Can you send logs to it?",
  "Does it work with front-end too?",
  "What's the pricing model — usage-based or per-seat?",
  "Does it support AI observability for LLM workloads?",
  "Is OpenTelemetry required, or can I use something else to send data?",
  "Can I get started without ripping out my current instrumentation?",
  "Does it support anomaly detection, or do you set thresholds manually?",
];

/**
 * Market-scan openers — "just looking around" style.
 */
export const MARKET_SCAN_QUESTIONS: string[] = [
  "Just looking around to see what's new.",
  "We're checking out observability options.",
  "Mostly browsing booths right now.",
  "Seeing what people are doing around incident response and tracing.",
  "We're evaluating a few tools — just getting a lay of the land.",
  "What are you all showing here?",
  "What's the thing you're most excited to show people this week?",
];

/**
 * Role-context-first openers — attendee introduces themselves before asking.
 * Biased toward SRE, platform, developer, DevOps, TDM.
 */
export const ROLE_INTRO_STATEMENTS: string[] = [
  "I'm an SRE, mostly focused on incident response and on-call.",
  "I work on the platform side — internal tooling and reliability for our teams.",
  "I'm a developer, but I rotate on-call so I deal with incidents too.",
  "I manage an engineering team, so I'm mostly thinking about tooling and team effectiveness.",
  "I'm a DevOps engineer — we own the full deployment and observability stack.",
  "I run the platform team — we handle internal tooling and reliability infrastructure.",
  "I'm a staff engineer mostly focused on distributed systems and reliability.",
];

// ── Broad opener detection ────────────────────────────────────────────────────

/**
 * Returns true when the trainee opens with a broad booth/product question or
 * conversation starter that doesn't presuppose a specific work problem.
 * These should trigger booth-entry mode rather than immediate pain discovery.
 */
const BROAD_OPENER_RE =
  /\b(how can (I|we) help|what brings you (by|here|over|today)|what are you (looking (at|for)|checking out)|what do you (do|make|build|sell|show)|what('?s| is) (this|your (product|platform|tool|solution|company))|what are you all (showing|doing|building)|anything (you'?re|you are) (hoping|looking)|tell me (about|what you do|more about))\b/i;

export function isBroadOpener(traineeText: string): boolean {
  return BROAD_OPENER_RE.test(traineeText);
}

// ── Pain-question detection ───────────────────────────────────────────────────

/**
 * Returns true when the trainee is explicitly asking about problems or challenges.
 * In this case, booth-entry mode is skipped and normal pain-discovery flows.
 */
const TRAINEE_PAIN_QUESTION_RE =
  /\b(challenge|challenges|problem|problems|pain point|pain points|struggling|struggle|frustrat|difficult|hard time|what'?s (hard|tough|broken|painful)|what (slows|keeps) you|incident|outage|debugging issue|on-call issue|what are you dealing with|what keeps you up)\b/i;

export function traineeAsksPainQuestion(traineeText: string): boolean {
  return TRAINEE_PAIN_QUESTION_RE.test(traineeText);
}

// ── Role-signal detection ─────────────────────────────────────────────────────

/**
 * Returns true when an attendee message contains a role/team self-introduction.
 * Used to detect when the attendee has already introduced context,
 * which allows the next turn to progress toward pain discovery.
 */
const ROLE_SIGNAL_RE =
  /\b(I'?m (an?|a) |I work (on|as|in)|my (team|role|job)|I'?m on (the|a)|we'?re (a|an|the)|our team|I run|I manage|I lead|I'?m a (developer|engineer|sre|devops|platform|staff|principal|manager))\b/i;

export function attendeeIntroducedRole(text: string): boolean {
  return ROLE_SIGNAL_RE.test(text);
}

// ── Persona-type helpers ──────────────────────────────────────────────────────

/**
 * Normalize persona type to a canonical role bucket for booth-entry biasing.
 */
function getPersonaBucket(persona: Persona | undefined): string {
  if (!persona) return "default";
  const pt = persona.personaType?.toLowerCase() ?? "";
  if (
    persona.isBuyer ||
    pt.includes("tdm") ||
    pt.includes("director") ||
    pt.includes("vp") ||
    /\bmanager\b/.test(pt)
  ) return "tdm";
  if (pt.includes("sre") || pt.includes("site reliability")) return "sre";
  if (pt.includes("platform") || pt.includes("infra")) return "platform";
  if (pt.includes("devops") || pt.includes("build") || pt.includes("release")) return "devops";
  if (pt.includes("developer") || pt.includes("dev") || pt.includes("engineer")) return "developer";
  return "default";
}

/**
 * Returns the preferred BoothEntryMode for this persona bucket
 * when the trainee opens with a broad or neutral opener.
 *
 * Biasing:
 *   SRE        → role_intro (introduces self before asking)
 *   Platform   → role_intro (introduces team context)
 *   TDM        → product_question (wants to understand the product)
 *   DevOps     → market_scan (scanning options)
 *   Developer  → product_question ("what is this?")
 *   default    → market_scan
 */
export function getPersonaBoothMode(persona: Persona | undefined): BoothEntryMode {
  const bucket = getPersonaBucket(persona);
  switch (bucket) {
    case "tdm":      return "product_question";
    case "sre":      return "role_intro";
    case "platform": return "role_intro";
    case "devops":   return "market_scan";
    case "developer":return "product_question";
    default:         return "market_scan";
  }
}

// ── Gating helper ─────────────────────────────────────────────────────────────

/**
 * Downgrade a booth-entry mode if the product hasn't been explained yet.
 *
 * Hard rule: competitor_question and evaluation_question are DISALLOWED until
 * productExplained === true.  Downgrade both to product_question so the
 * attendee asks "What is Honeycomb?" instead of jumping to comparisons.
 */
function gateByProductExplained(
  mode: BoothEntryMode,
  productExplained: boolean | undefined
): BoothEntryMode {
  if (productExplained) return mode;
  if (mode === "competitor_question" || mode === "evaluation_question") {
    return "product_question";
  }
  return mode;
}

// ── Main booth entry mode detector ────────────────────────────────────────────

/**
 * Determine whether the attendee should respond with booth-entry behavior
 * rather than diving directly into pain discovery.
 *
 * Rules:
 * - Only active for the first 3 attendee turns (attendeeCount 0–2)
 * - Returns "none" after 3 turns → normal director flow resumes
 * - Returns "pain_discovery" when:
 *     • trainee explicitly asks about problems/challenges
 *     • attendee already introduced role/context in a previous turn
 * - On turn 0 with a broad opener → getPersonaBoothMode(persona)
 * - On turn 0 without a broad opener → "market_scan" (neutral entry)
 * - On turns 1–2 with a broad opener → escalate toward evaluation/competitor
 * - On turns 1–2 without a broad opener → "none" (let director handle it)
 *
 * Sequencing gate (productExplained):
 * - Turn 0–1 (attendeeCount 0–1): safe modes only (market_scan, role_intro,
 *   product_question).  competitor/evaluation modes are downgraded to
 *   product_question until session.productExplained === true.
 * - Turn 2 (attendeeCount=2): competitor/evaluation allowed ONLY if
 *   session.productExplained === true; otherwise → product_question.
 */
export function detectBoothEntryMode(
  session: SessionState,
  traineeText: string,
  persona: Persona | undefined
): BoothEntryMode {
  const attendeeMessages = session.transcript.filter((m) => m.type === "attendee");
  const attendeeCount = attendeeMessages.length;
  const productExplained = session.productExplained;

  // Only applies for the first 3 attendee turns
  if (attendeeCount > 2) return "none";

  // If trainee is explicitly asking about challenges/pain, let pain-discovery flow
  if (traineeAsksPainQuestion(traineeText)) return "pain_discovery";

  // If attendee has already introduced their role/context, let director progress
  if (attendeeCount >= 1) {
    const prevAttendeeTexts = attendeeMessages.map((m) => m.text).join(" ");
    if (attendeeIntroducedRole(prevAttendeeTexts)) return "pain_discovery";
  }

  // Turn 0: always give a booth-entry response (safe modes only)
  if (attendeeCount === 0) {
    if (isBroadOpener(traineeText)) {
      // getPersonaBoothMode returns product_question, role_intro, or market_scan
      // — all safe, no gating needed for turn 0
      return getPersonaBoothMode(persona);
    }
    // Non-opener on turn 0 (e.g. trainee pitches immediately) → neutral browsing
    return "market_scan";
  }

  // Turns 1–2: escalate toward evaluation/competitor if still a broad opener,
  //            but gate competitor/evaluation behind productExplained.
  if (isBroadOpener(traineeText)) {
    const bucket = getPersonaBucket(persona);
    // Turn 1: more specific based on persona — but gate advanced modes
    if (attendeeCount === 1) {
      let raw: BoothEntryMode;
      if (bucket === "tdm")       raw = "competitor_question";
      else if (bucket === "sre")  raw = "evaluation_question";
      else if (bucket === "platform") raw = "competitor_question";
      else if (bucket === "devops")   raw = "evaluation_question";
      else if (bucket === "developer")raw = "evaluation_question";
      else                            raw = "evaluation_question";
      return gateByProductExplained(raw, productExplained);
    }
    // Turn 2: evaluation — gated
    return gateByProductExplained("evaluation_question", productExplained);
  }

  // Not a broad opener and no explicit pain signal → let director handle normally
  return "none";
}

// ── Response picker ───────────────────────────────────────────────────────────

/**
 * Pick a deterministic booth-entry response from the appropriate bank.
 * Uses traineeTurnCount as a deterministic seed.
 */
export function pickBoothEntryResponse(
  mode: BoothEntryMode,
  _persona: Persona | undefined,
  traineeTurnCount: number
): string {
  switch (mode) {
    case "product_question":
      return PRODUCT_QUESTIONS[traineeTurnCount % PRODUCT_QUESTIONS.length];
    case "competitor_question":
      return COMPETITOR_QUESTIONS[traineeTurnCount % COMPETITOR_QUESTIONS.length];
    case "evaluation_question":
      return EVALUATION_QUESTIONS[traineeTurnCount % EVALUATION_QUESTIONS.length];
    case "market_scan":
      return MARKET_SCAN_QUESTIONS[traineeTurnCount % MARKET_SCAN_QUESTIONS.length];
    case "role_intro":
      return ROLE_INTRO_STATEMENTS[traineeTurnCount % ROLE_INTRO_STATEMENTS.length];
    default:
      // pain_discovery / none should not reach here — caller guards
      return MARKET_SCAN_QUESTIONS[traineeTurnCount % MARKET_SCAN_QUESTIONS.length];
  }
}
