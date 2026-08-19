/**
 * Tests for booth-entry FAQ behavior.
 *
 * A) Early broad opener doesn't produce share_pain → returns booth_entry move
 * B) TDM persona first/second turn produces product_question or competitor_question
 * C) SRE persona first turn produces role_intro (not immediate deep pain dump)
 * D) After a booth-entry turn + role intro, the next turn can progress to pain discovery
 * E) FAQ-derived questions are semantically aligned with FAQ categories
 * F) detectBoothEntryMode edge cases
 * G) Regression: after turn 3, booth_entry is no longer fired
 */

import {
  detectBoothEntryMode,
  isBroadOpener,
  traineeAsksPainQuestion,
  getPersonaBoothMode,
  pickBoothEntryResponse,
  attendeeIntroducedRole,
  PRODUCT_QUESTIONS,
  COMPETITOR_QUESTIONS,
  EVALUATION_QUESTIONS,
  MARKET_SCAN_QUESTIONS,
  ROLE_INTRO_STATEMENTS,
  type BoothEntryMode,
} from "../attendee/boothFaqBehavior";
import { detectProductExplanation } from "../attendee/conversationDirector";
import { generateAttendeeReply } from "../attendee/generateAttendeeReply";
import type { SessionState } from "../storage";
import type { Persona } from "../scenarioTypes";

// ── Minimal helpers ───────────────────────────────────────────────────────────

let passCount = 0;
let failCount = 0;

function assert(label: string, actual: unknown, expected: unknown): void {
  const pass =
    JSON.stringify(actual) === JSON.stringify(expected) ||
    actual === expected;
  if (pass) {
    console.log(`  ✓ ${label}`);
    passCount++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
    failCount++;
  }
}

function assertContains(label: string, text: string, substring: string): void {
  if (text.toLowerCase().includes(substring.toLowerCase())) {
    console.log(`  ✓ ${label}`);
    passCount++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`    expected "${text}" to contain "${substring}"`);
    failCount++;
  }
}

function assertNotContains(label: string, text: string, substring: string): void {
  if (!text.toLowerCase().includes(substring.toLowerCase())) {
    console.log(`  ✓ ${label}`);
    passCount++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`    expected "${text}" NOT to contain "${substring}"`);
    failCount++;
  }
}

function assertNotEqual(label: string, actual: unknown, unexpected: unknown): void {
  if (actual !== unexpected) {
    console.log(`  ✓ ${label}`);
    passCount++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`    expected NOT: ${JSON.stringify(unexpected)}`);
    failCount++;
  }
}

function makeSession(overrides: Partial<SessionState> = {}): SessionState {
  return {
    id: "test-session",
    scenarioId: "test",
    startedAt: new Date().toISOString(),
    transcript: [],
    momentum: { score: 0, events: [] },
    solutionIntroduced: false,
    ...overrides,
  } as unknown as SessionState;
}

function makeSREPersona(): Persona {
  return {
    id: "sre-persona",
    name: "Alex",
    personaType: "SRE",
    modifiers: [],
    emotionalPosture: "curious",
    toolingBias: "pragmatic",
    otelFamiliarity: "considering",
    isBuyer: false,
    createdAt: new Date().toISOString(),
    createdBy: "system",
    painAnchors: [
      {
        id: "oncall-pain",
        pain: "On-call is exhausting — we get paged constantly and it takes forever to find root cause.",
        keywords: ["on-call", "alert", "incident", "paged", "noise"],
        priority: "primary",
        testPhrases: ["on-call", "paged"],
      },
    ],
    toolStackOptions: [
      { variant: "Prometheus + Grafana", tools: ["Prometheus", "Grafana"] },
    ],
  } as Persona;
}

function makeTDMPersona(): Persona {
  return {
    id: "tdm-persona",
    name: "Sam",
    personaType: "TDM Engineering Manager",
    modifiers: [],
    emotionalPosture: "neutral",
    toolingBias: "cost-conscious",
    otelFamiliarity: "aware",
    isBuyer: true,
    createdAt: new Date().toISOString(),
    createdBy: "system",
    painAnchors: [
      {
        id: "team-efficiency",
        pain: "We're spending too much time on toil and not enough shipping features.",
        keywords: ["toil", "efficiency", "team", "shipping", "features"],
        priority: "primary",
        testPhrases: ["toil", "efficiency"],
      },
    ],
  } as Persona;
}

function makePlatformPersona(): Persona {
  return {
    id: "platform-persona",
    name: "Jordan",
    personaType: "Platform Engineer",
    modifiers: [],
    emotionalPosture: "curious",
    toolingBias: "scale-focused",
    otelFamiliarity: "starting",
    isBuyer: false,
    createdAt: new Date().toISOString(),
    createdBy: "system",
    painAnchors: [],
  } as Persona;
}

// ── Test A: early broad openers → booth_entry, not share_pain ────────────────

console.log("\nTest A: broad opener → booth_entry (not share_pain)");
{
  const BROAD_OPENERS = [
    "How can I help?",
    "What brings you by?",
    "What are you looking at?",
    "What do you do?",
    "What is this?",
    "Tell me about what you do here.",
    "What are you all showing here?",
  ];

  for (const opener of BROAD_OPENERS) {
    const session = makeSession();
    (session as any).persona = makeSREPersona();
    const result = generateAttendeeReply({
      traineeText: opener,
      session,
      traineeTurnCount: 1,
    });
    assert(`A) "${opener}" produces a reply`, result !== null, true);
    assertNotEqual(
      `A) "${opener.slice(0, 25)}" is NOT share_pain (not immediate pain dump)`,
      (result?.text ?? "").toLowerCase().match(/we'?re dealing with|alert noise|on-call is exhausting|our debugging cycles/i) !== null,
      true
    );
  }
}

// ── Test B: TDM first/second turn → product_question or competitor_question ──

console.log("\nTest B: TDM first turn → product_question or competitor_question");
{
  const TDM_FAQ_TERMS = [
    "honeycomb", "what do you all do", "observability", "apm", "datadog",
    "grafana", "new relic", "splunk", "what is this", "what makes this",
    "monitoring tool", "what's the pitch",
  ];

  // Turn 0 (attendeeCount = 0)
  const session0 = makeSession();
  (session0 as any).persona = makeTDMPersona();
  const res0 = generateAttendeeReply({
    traineeText: "How can I help?",
    session: session0,
    traineeTurnCount: 0,
  });
  assert("B) TDM turn 0 produces a reply", res0 !== null, true);
  const hasFaqTerm0 = TDM_FAQ_TERMS.some((t) =>
    (res0?.text ?? "").toLowerCase().includes(t)
  );
  assert("B) TDM turn 0 contains FAQ term (product or competitor question)", hasFaqTerm0, true);

  // Simulate turn 1 (attendeeCount = 1, attendee said a product_question)
  const session1 = makeSession();
  session1.transcript.push({
    id: "t1", type: "trainee", text: "How can I help?", timestamp: new Date().toISOString(),
  } as any);
  session1.transcript.push({
    id: "a1", type: "attendee", text: "What is Honeycomb exactly?", timestamp: new Date().toISOString(),
  } as any);
  (session1 as any).persona = makeTDMPersona();

  const res1 = generateAttendeeReply({
    traineeText: "What brings you by today?",
    session: session1,
    traineeTurnCount: 1,
  });
  assert("B) TDM turn 1 produces a reply", res1 !== null, true);
  // Turn 1 for TDM → competitor_question
  const hasFaqTerm1 = TDM_FAQ_TERMS.some((t) =>
    (res1?.text ?? "").toLowerCase().includes(t)
  );
  assert("B) TDM turn 1 still contains FAQ term", hasFaqTerm1, true);
}

// ── Test C: SRE first turn → role_intro, not immediate deep pain dump ─────────

console.log("\nTest C: SRE first turn → role_intro (not immediate pain dump)");
{
  const SRE_PAIN_DUMP_PATTERNS = [
    /on-call is exhausting/i,
    /we get paged constantly/i,
    /alert noise is terrible/i,
    /our debugging cycles are bad/i,
    /we'?re dealing with a lot of/i,
  ];

  const session = makeSession();
  (session as any).persona = makeSREPersona();
  const res = generateAttendeeReply({
    traineeText: "How can I help?",
    session,
    traineeTurnCount: 0,
  });
  assert("C) SRE turn 0 produces a reply", res !== null, true);

  const text = res?.text ?? "";
  const isPainDump = SRE_PAIN_DUMP_PATTERNS.some((p) => p.test(text));
  assert("C) SRE turn 0 is NOT an immediate pain dump", isPainDump, false);

  // SRE should get role_intro mode → mentions SRE, incidents, on-call, platform, etc.
  const hasSREContext = /\b(sre|incident|on-call|platform|reliability|engineer|developer|stack|observability)\b/i.test(text);
  assert("C) SRE turn 0 has role/context framing", hasSREContext, true);
}

// ── Test D: after booth_entry + role intro, next turn can discover pain ───────

console.log("\nTest D: after role-intro attendee turn, next turn progresses to pain discovery");
{
  // Attendee already said a role-intro statement → detectBoothEntryMode should return "pain_discovery"
  const session = makeSession();
  session.transcript.push({
    id: "t1", type: "trainee", text: "How can I help?", timestamp: new Date().toISOString(),
  } as any);
  // Attendee's role-intro statement
  session.transcript.push({
    id: "a1",
    type: "attendee",
    text: "I'm an SRE, mostly focused on incident response and on-call.",
    timestamp: new Date().toISOString(),
  } as any);
  (session as any).persona = makeSREPersona();

  // Now trainee follows up with a pain-eliciting question
  const mode = detectBoothEntryMode(session, "What brings you to our booth today?", makeSREPersona());
  assert("D) detectBoothEntryMode returns pain_discovery after role intro", mode, "pain_discovery");

  // Full generator: trainee asks something warm → attendee should NOT do booth_entry
  const res = generateAttendeeReply({
    traineeText: "What brings you by today?",
    session,
    traineeTurnCount: 2,
  });
  assert("D) post-role-intro reply is not null", res !== null, true);
  // Should NOT be a booth_entry product question
  const isFaqQuestion = PRODUCT_QUESTIONS.some((q) => res?.text === q) ||
    COMPETITOR_QUESTIONS.some((q) => res?.text === q);
  assert("D) post-role-intro reply is NOT a booth_entry product question", isFaqQuestion, false);
}

// ── Test E: FAQ categories are represented ────────────────────────────────────

console.log("\nTest E: FAQ categories are semantically aligned with uploaded FAQ");
{
  // Product category — what is / observability / APM
  const hasProductQ = PRODUCT_QUESTIONS.some(
    (q) => /\b(honeycomb|observability|apm|monitoring tool|problem|find issues)\b/i.test(q)
  );
  assert("E) PRODUCT_QUESTIONS covers product/observability/APM category", hasProductQ, true);

  // Competitor category — vs Datadog, Grafana, Prometheus, Splunk, New Relic
  const hasDatadog = COMPETITOR_QUESTIONS.some((q) => /datadog/i.test(q));
  const hasGrafana = COMPETITOR_QUESTIONS.some((q) => /grafana/i.test(q));
  const hasSplunk = COMPETITOR_QUESTIONS.some((q) => /splunk/i.test(q));
  const hasNewRelic = COMPETITOR_QUESTIONS.some((q) => /new relic/i.test(q));
  assert("E) COMPETITOR_QUESTIONS covers Datadog", hasDatadog, true);
  assert("E) COMPETITOR_QUESTIONS covers Grafana", hasGrafana, true);
  assert("E) COMPETITOR_QUESTIONS covers Splunk", hasSplunk, true);
  assert("E) COMPETITOR_QUESTIONS covers New Relic", hasNewRelic, true);

  // Evaluation — free tier / pricing / OTel / LLM / logs / front-end
  const hasFreeTier = EVALUATION_QUESTIONS.some((q) => /free tier/i.test(q));
  const hasOTel = EVALUATION_QUESTIONS.some((q) => /opentelemetry/i.test(q));
  const hasLLM = EVALUATION_QUESTIONS.some((q) => /llm/i.test(q));
  const hasLogs = EVALUATION_QUESTIONS.some((q) => /log/i.test(q));
  const hasAI = EVALUATION_QUESTIONS.some((q) => /ai|anomaly/i.test(q));
  assert("E) EVALUATION_QUESTIONS covers free tier (FAQ: pricing)", hasFreeTier, true);
  assert("E) EVALUATION_QUESTIONS covers OTel (FAQ: OpenTelemetry)", hasOTel, true);
  assert("E) EVALUATION_QUESTIONS covers LLM observability (FAQ: AI-era)", hasLLM, true);
  assert("E) EVALUATION_QUESTIONS covers logs (FAQ: ingest)", hasLogs, true);
  assert("E) EVALUATION_QUESTIONS covers AI/anomaly detection (FAQ: AI)", hasAI, true);

  // Market scan — browsing / checking out options
  const hasBrowsing = MARKET_SCAN_QUESTIONS.some(
    (q) => /\b(browsing|looking around|checking out|evaluating|what are you all showing)\b/i.test(q)
  );
  assert("E) MARKET_SCAN_QUESTIONS covers browsing/scanning", hasBrowsing, true);

  // Role intro — SRE, platform, developer, DevOps, manager
  const hasSREIntro = ROLE_INTRO_STATEMENTS.some((s) => /sre/i.test(s));
  const hasPlatformIntro = ROLE_INTRO_STATEMENTS.some((s) => /platform/i.test(s));
  const hasDeveloperIntro = ROLE_INTRO_STATEMENTS.some((s) => /developer/i.test(s));
  assert("E) ROLE_INTRO_STATEMENTS has SRE intro", hasSREIntro, true);
  assert("E) ROLE_INTRO_STATEMENTS has platform intro", hasPlatformIntro, true);
  assert("E) ROLE_INTRO_STATEMENTS has developer intro", hasDeveloperIntro, true);
}

// ── Test F: detectBoothEntryMode edge cases ───────────────────────────────────

console.log("\nTest F: detectBoothEntryMode edge cases");
{
  // F1: attendeeCount === 0, broad opener, SRE → role_intro
  {
    const session = makeSession();
    const mode = detectBoothEntryMode(session, "How can I help?", makeSREPersona());
    assert("F) turn 0 + broad opener + SRE → role_intro", mode, "role_intro");
  }

  // F2: attendeeCount === 0, broad opener, TDM → product_question
  {
    const session = makeSession();
    const mode = detectBoothEntryMode(session, "What brings you by?", makeTDMPersona());
    assert("F) turn 0 + broad opener + TDM → product_question", mode, "product_question");
  }

  // F3: attendeeCount === 0, non-opener → market_scan
  {
    const session = makeSession();
    const mode = detectBoothEntryMode(session, "We built something that helps with debugging.", undefined);
    assert("F) turn 0 + non-opener → market_scan", mode, "market_scan");
  }

  // F4: trainee asks pain question → pain_discovery
  {
    const session = makeSession();
    const mode = detectBoothEntryMode(session, "What challenges are you running into?", makeSREPersona());
    assert("F) trainee asks pain question → pain_discovery", mode, "pain_discovery");
  }

  // F5: attendeeCount > 2 → none
  {
    const session = makeSession();
    // Add 3 attendee messages
    for (let i = 0; i < 3; i++) {
      session.transcript.push({
        id: `t${i}`, type: "trainee", text: "How can I help?", timestamp: new Date().toISOString(),
      } as any);
      session.transcript.push({
        id: `a${i}`, type: "attendee", text: "Just looking around.", timestamp: new Date().toISOString(),
      } as any);
    }
    const mode = detectBoothEntryMode(session, "How can I help?", makeSREPersona());
    assert("F) attendeeCount > 2 → none (stop booth_entry)", mode, "none");
  }

  // F6: attendeeCount === 1, attendee already said role intro → pain_discovery
  {
    const session = makeSession();
    session.transcript.push({
      id: "t1", type: "trainee", text: "How can I help?", timestamp: new Date().toISOString(),
    } as any);
    session.transcript.push({
      id: "a1",
      type: "attendee",
      text: "I'm an SRE — I work on the platform side.",
      timestamp: new Date().toISOString(),
    } as any);
    const mode = detectBoothEntryMode(session, "What brings you by?", makeSREPersona());
    assert("F) attendee already introduced role → pain_discovery", mode, "pain_discovery");
  }

  // F7: isBroadOpener patterns
  assert("F) 'How can I help?' → broad opener", isBroadOpener("How can I help?"), true);
  assert("F) 'What brings you by?' → broad opener", isBroadOpener("What brings you by?"), true);
  assert("F) 'What is this?' → broad opener", isBroadOpener("What is this?"), true);
  assert("F) 'Tell me about what you do here.' → broad opener", isBroadOpener("Tell me about what you do here."), true);
  assert("F) 'Where does it usually break?' → NOT broad opener", isBroadOpener("Where does it usually break?"), false);
  assert("F) 'How does pricing work?' → NOT broad opener", isBroadOpener("How does pricing work?"), false);

  // F8: traineeAsksPainQuestion patterns
  assert("F) 'What challenges are you dealing with?' → pain question", traineeAsksPainQuestion("What challenges are you dealing with?"), true);
  assert("F) 'Are you struggling with anything?' → pain question", traineeAsksPainQuestion("Are you struggling with anything?"), true);
  assert("F) 'How can I help?' → NOT pain question", traineeAsksPainQuestion("How can I help?"), false);
  assert("F) 'What do you do?' → NOT pain question", traineeAsksPainQuestion("What do you do?"), false);
}

// ── Test G: after 3 turns, booth_entry is not fired ──────────────────────────

console.log("\nTest G: booth_entry stops after turn 3");
{
  const session = makeSession();
  (session as any).persona = makeSREPersona();

  // Simulate 3 attendee turns already in transcript
  for (let i = 0; i < 3; i++) {
    session.transcript.push({
      id: `t${i}`, type: "trainee", text: "Anything you're hoping to improve?", timestamp: new Date().toISOString(),
    } as any);
    const boothResponses = [
      "I'm an SRE — mostly focused on incident response.",
      "Yeah, we deal with a fair amount of alert noise.",
      "OTel is interesting — we're starting to evaluate it.",
    ];
    session.transcript.push({
      id: `a${i}`, type: "attendee", text: boothResponses[i], timestamp: new Date().toISOString(),
    } as any);
  }

  const result = generateAttendeeReply({
    traineeText: "How can I help?",
    session,
    traineeTurnCount: 4,
  });
  assert("G) after 3 turns, reply is not null", result !== null, true);
  // Should NOT be a pure FAQ product question at this point
  const isBareProductQ = PRODUCT_QUESTIONS.some((q) => result?.text === q);
  assert("G) after 3 turns, reply is NOT a bare booth_entry product question", isBareProductQ, false);
}

// ── Test H: getPersonaBoothMode biasing ──────────────────────────────────────

console.log("\nTest H: getPersonaBoothMode persona biasing");
{
  assert("H) SRE → role_intro", getPersonaBoothMode(makeSREPersona()), "role_intro");
  assert("H) TDM (isBuyer) → product_question", getPersonaBoothMode(makeTDMPersona()), "product_question");
  assert("H) Platform → role_intro", getPersonaBoothMode(makePlatformPersona()), "role_intro");
  assert("H) undefined → market_scan", getPersonaBoothMode(undefined), "market_scan");

  const devOpsPersona: Persona = {
    ...makeSREPersona(),
    id: "devops",
    personaType: "DevOps Engineer",
    isBuyer: false,
  };
  assert("H) DevOps → market_scan", getPersonaBoothMode(devOpsPersona), "market_scan");

  const devPersona: Persona = {
    ...makeSREPersona(),
    id: "dev",
    personaType: "Developer",
    isBuyer: false,
  };
  assert("H) Developer → product_question", getPersonaBoothMode(devPersona), "product_question");
}

// ── Test I: pickBoothEntryResponse determinism ────────────────────────────────

console.log("\nTest I: pickBoothEntryResponse is deterministic");
{
  // Same inputs → same output
  const r1 = pickBoothEntryResponse("product_question", undefined, 0);
  const r2 = pickBoothEntryResponse("product_question", undefined, 0);
  assert("I) same seed → same product_question", r1, r2);

  const r3 = pickBoothEntryResponse("competitor_question", undefined, 2);
  const r4 = pickBoothEntryResponse("competitor_question", undefined, 2);
  assert("I) same seed → same competitor_question", r3, r4);

  // Different seeds → likely different outputs (banks have 7-8 entries, indices 0 and 1 differ)
  const r5 = pickBoothEntryResponse("evaluation_question", undefined, 0);
  const r6 = pickBoothEntryResponse("evaluation_question", undefined, 1);
  // This won't always differ but for single-item banks it might not — just check valid strings
  assert("I) evaluation_question produces a string", typeof r5, "string");
  assert("I) evaluation_question produces non-empty string", r5.length > 0, true);
  assert("I) different seed produces a valid string", typeof r6, "string");
}

// ── Test J: detectProductExplanation recognizes product framing ───────────────

console.log("\nTest J: detectProductExplanation — product framing detection");
{
  // Seq-F: positive cases — real product framing sentences
  assert(
    "J) 'Honeycomb is an observability platform.' → true",
    detectProductExplanation("Honeycomb is an observability platform."),
    true
  );
  assert(
    "J) 'We help teams debug distributed systems faster.' → true",
    detectProductExplanation("We help teams debug distributed systems faster."),
    true
  );
  assert(
    "J) 'It lets you query your telemetry in real time.' → true",
    detectProductExplanation("It lets you query your telemetry in real time."),
    true
  );
  assert(
    "J) 'With Honeycomb you can trace requests end to end.' → true",
    detectProductExplanation("With Honeycomb you can trace requests end to end."),
    true
  );
  assert(
    "J) 'Honeycomb helps engineers find root causes faster.' → true",
    detectProductExplanation("Honeycomb helps engineers find root causes faster."),
    true
  );
  assert(
    "J) 'Honeycomb enables high-cardinality queries.' → true",
    detectProductExplanation("Honeycomb enables high-cardinality queries."),
    true
  );
  assert(
    "J) 'So Honeycomb gives you wide events instead of metrics.' → true",
    detectProductExplanation("So Honeycomb gives you wide events instead of metrics."),
    true
  );

  // Negative cases — domain words but no product framing
  assert(
    "J) 'We're doing distributed tracing.' → false (no product subject)",
    detectProductExplanation("We're doing distributed tracing."),
    false
  );
  assert(
    "J) 'Check out this dashboard.' → false",
    detectProductExplanation("Check out this dashboard."),
    false
  );
  assert(
    "J) 'Have you heard of OpenTelemetry?' → false",
    detectProductExplanation("Have you heard of OpenTelemetry?"),
    false
  );
  assert(
    "J) 'What challenges are you dealing with?' → false",
    detectProductExplanation("What challenges are you dealing with?"),
    false
  );
}

// ── Test K: productExplained sequencing — competitor/evaluation gating ────────

console.log("\nTest K: productExplained gates competitor/evaluation booth questions");

function makeSessionWithTurns(
  attendeeTexts: string[],
  productExplained?: boolean
): SessionState {
  const session = makeSession({ productExplained });
  attendeeTexts.forEach((text, i) => {
    session.transcript.push({
      id: `t${i}`,
      type: "trainee",
      text: "How can I help?",
      timestamp: new Date().toISOString(),
    } as any);
    session.transcript.push({
      id: `a${i}`,
      type: "attendee",
      text,
      timestamp: new Date().toISOString(),
    } as any);
  });
  return session;
}

{
  // Seq-A: Turn 0 — TDM persona always gets product_question (safe mode, no gating needed)
  console.log("  Seq-A: Turn 0 — safe modes only, no gating needed");
  {
    const session = makeSession({ productExplained: false });
    const mode = detectBoothEntryMode(session, "How can I help?", makeTDMPersona());
    assert("K/Seq-A) TDM turn 0 + productExplained=false → product_question (safe mode)", mode, "product_question");
  }
  {
    const session = makeSession({ productExplained: true });
    const mode = detectBoothEntryMode(session, "How can I help?", makeTDMPersona());
    assert("K/Seq-A) TDM turn 0 + productExplained=true → product_question (unchanged)", mode, "product_question");
  }
  {
    const session = makeSession({ productExplained: false });
    const mode = detectBoothEntryMode(session, "How can I help?", makeSREPersona());
    assert("K/Seq-A) SRE turn 0 + productExplained=false → role_intro (safe mode)", mode, "role_intro");
  }
}

{
  // Seq-B: Turn 1 — competitor_question gated when !productExplained
  console.log("  Seq-B: Turn 1 — competitor_question gated by productExplained");
  const attendeeFirst = ["What is Honeycomb exactly?"];

  {
    // TDM + productExplained=false → should downgrade competitor → product_question
    const session = makeSessionWithTurns(attendeeFirst, false);
    const mode = detectBoothEntryMode(session, "How can I help?", makeTDMPersona());
    assert(
      "K/Seq-B) TDM turn 1 + productExplained=false → product_question (competitor downgraded)",
      mode,
      "product_question"
    );
    assert(
      "K/Seq-B) result is NOT competitor_question",
      mode !== "competitor_question",
      true
    );
  }

  {
    // TDM + productExplained=true → competitor_question allowed
    const session = makeSessionWithTurns(attendeeFirst, true);
    const mode = detectBoothEntryMode(session, "How can I help?", makeTDMPersona());
    assert(
      "K/Seq-B) TDM turn 1 + productExplained=true → competitor_question (allowed)",
      mode,
      "competitor_question"
    );
  }
}

{
  // Seq-C: Turn 1 — evaluation_question gated when !productExplained
  console.log("  Seq-C: Turn 1 — evaluation_question gated by productExplained");
  const attendeeFirst = ["I'm an SRE, mostly focused on incident response and on-call."];

  {
    // SRE + productExplained=false → downgrade evaluation → product_question
    // (But SRE role intro → pain_discovery. Use non-role-intro attendee message.)
    const attendeeFirstNoRole = ["Just looking around."];
    const session = makeSessionWithTurns(attendeeFirstNoRole, false);
    const mode = detectBoothEntryMode(session, "What brings you by?", makeSREPersona());
    assert(
      "K/Seq-C) SRE turn 1 + productExplained=false → product_question (evaluation downgraded)",
      mode,
      "product_question"
    );
  }

  {
    // SRE + productExplained=true → evaluation_question allowed
    const attendeeFirstNoRole = ["Just looking around."];
    const session = makeSessionWithTurns(attendeeFirstNoRole, true);
    const mode = detectBoothEntryMode(session, "What brings you by?", makeSREPersona());
    assert(
      "K/Seq-C) SRE turn 1 + productExplained=true → evaluation_question (allowed)",
      mode,
      "evaluation_question"
    );
  }
}

{
  // Seq-D: Turn 2 — evaluation_question gated when !productExplained
  console.log("  Seq-D: Turn 2 — evaluation_question gated by productExplained");
  const attendeeTurns = ["Just looking around.", "So how does this work?"];

  {
    // productExplained=false → downgrade evaluation → product_question
    const session = makeSessionWithTurns(attendeeTurns, false);
    const mode = detectBoothEntryMode(session, "What do you make of it?", makeSREPersona());
    assert(
      "K/Seq-D) turn 2 + productExplained=false → product_question (evaluation downgraded)",
      mode,
      "product_question"
    );
  }

  {
    // productExplained=true → evaluation_question allowed
    const session = makeSessionWithTurns(attendeeTurns, true);
    const mode = detectBoothEntryMode(session, "What do you make of it?", makeSREPersona());
    assert(
      "K/Seq-D) turn 2 + productExplained=true → evaluation_question (allowed)",
      mode,
      "evaluation_question"
    );
  }
}

{
  // Seq-E: Platform persona turn 1 — competitor gated
  console.log("  Seq-E: Platform persona turn 1 — competitor gated by productExplained");
  const attendeeFirst = ["Just looking around."];

  {
    const session = makeSessionWithTurns(attendeeFirst, false);
    const mode = detectBoothEntryMode(session, "How can I help?", makePlatformPersona());
    assert(
      "K/Seq-E) Platform turn 1 + productExplained=false → product_question (competitor downgraded)",
      mode,
      "product_question"
    );
  }

  {
    const session = makeSessionWithTurns(attendeeFirst, true);
    const mode = detectBoothEntryMode(session, "How can I help?", makePlatformPersona());
    assert(
      "K/Seq-E) Platform turn 1 + productExplained=true → competitor_question (allowed)",
      mode,
      "competitor_question"
    );
  }
}

{
  // Seq-F: gateByProductExplained never returns "none" — always falls back to product_question
  console.log("  Seq-F: downgrade always produces product_question, never 'none'");

  // With productExplained=false, all competitor/evaluation modes → product_question
  const modes: BoothEntryMode[] = ["competitor_question", "evaluation_question"];
  for (const inputMode of modes) {
    // Simulate via a turn 1 where persona would produce that mode
    const attendeeFirst = ["Just looking around."];

    if (inputMode === "competitor_question") {
      // TDM gives competitor_question on turn 1
      const session = makeSessionWithTurns(attendeeFirst, false);
      const mode = detectBoothEntryMode(session, "What brings you by?", makeTDMPersona());
      assert(
        `K/Seq-F) ${inputMode} + !productExplained → product_question (not "none")`,
        mode,
        "product_question"
      );
      assert(
        `K/Seq-F) ${inputMode} + !productExplained result is NOT "none"`,
        mode !== "none",
        true
      );
    } else {
      // SRE with non-role-intro gives evaluation_question on turn 1
      const session = makeSessionWithTurns(attendeeFirst, false);
      const mode = detectBoothEntryMode(session, "What brings you by?", makeSREPersona());
      assert(
        `K/Seq-F) ${inputMode} + !productExplained → product_question (not "none")`,
        mode,
        "product_question"
      );
      assert(
        `K/Seq-F) ${inputMode} + !productExplained result is NOT "none"`,
        mode !== "none",
        true
      );
    }
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`  ${passCount} passed, ${failCount} failed`);
if (failCount > 0) process.exit(1);
