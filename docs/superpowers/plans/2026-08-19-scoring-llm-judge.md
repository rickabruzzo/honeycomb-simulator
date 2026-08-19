# Scoring v2 — LLM Judge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace keyword-count scoring with an LLM judge that scores each dimension against an anchored 0–5 rubric and cites the trainee's own words, falling back to the retained heuristic scorer so a session is always scored.

**Architecture:** `scoreSession` becomes async: it calls `judgeSession` (LLM via the existing chat provider), maps the judge's 0–5 scores to the existing 0–20 breakdown, derives the grade from the total with no outcome floor, and assembles the existing `ScoreRecord` (plus additive `evidence` and `scoringMethod`). On any judge failure it falls back to `heuristicScore`, which is today's `scoreSession` body retained verbatim.

**Tech Stack:** TypeScript, Next.js 16, the existing `getChatProvider()` abstraction, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-19-scoring-llm-judge-design.md`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `lib/scoring.ts` | `scoreSession` orchestrator (async); `heuristicScore` fallback; `ScoreRecord` type | Modify |
| `lib/scoring/rubric.ts` | Versioned rubric anchors + judge system prompt + transcript renderer | Create |
| `lib/scoring/judge.ts` | `judgeSession`, `JudgeResult` types, `parseJudgeResult` | Create |
| `lib/scoring/judge.test.ts` | Contract tests: parse, map, grade, fallback, nudge | Create |
| `app/api/session/[id]/complete/route.ts` | `await scoreSession` | Modify (1 line) |
| `app/api/session/[id]/end/route.ts` | `await scoreSession` | Modify (1 line) |
| `app/api/session/[id]/message/route.ts` | remove dead `scoreSession` import | Modify (1 line) |
| `scripts/score-real-transcript.mjs` | Manual live E2E on the real TDM transcript | Create |

Ordering: retain the current logic as a named fallback first (pure refactor, no behavior
change), then build the rubric and judge as leaf units, then the async orchestrator that uses
them, then wire call sites, then the live check.

---

## Task 1: Retain current scoring as `heuristicScore`

Pure refactor. Rename the current `scoreSession` to `heuristicScore` and add a thin async
`scoreSession` that just calls it. No behavior change yet — this keeps every consumer working
while the judge is built, and preserves the existing heuristic tests.

**Files:**
- Modify: `lib/scoring.ts`

- [ ] **Step 1: Rename the function**

In `lib/scoring.ts`, rename the existing `export function scoreSession(` to
`function heuristicScore(` (drop `export`):

```ts
function heuristicScore(
  session: SessionState,
  token: string
): ScoreRecord {
```

- [ ] **Step 2: Add the async orchestrator that delegates for now**

Immediately above `heuristicScore`, add:

```ts
/**
 * Score a completed session.
 *
 * Async because scoring now consults an LLM judge (Task 5). For this task it delegates to the
 * retained heuristic scorer unchanged; the judge is wired in later so each step stays a pure,
 * reviewable change.
 */
export async function scoreSession(
  session: SessionState,
  token: string
): Promise<ScoreRecord> {
  return heuristicScore(session, token);
}
```

- [ ] **Step 3: Make the two call sites await**

In `app/api/session/[id]/complete/route.ts`, change:

```ts
            const scoreRecord = scoreSession(session, token);
```
to:
```ts
            const scoreRecord = await scoreSession(session, token);
```

In `app/api/session/[id]/end/route.ts`, change:

```ts
            const scoreRecord = scoreSession(session, token);
```
to:
```ts
            const scoreRecord = await scoreSession(session, token);
```

- [ ] **Step 4: Remove the dead import**

In `app/api/session/[id]/message/route.ts`, delete this line (the symbol is imported but never
called):

```ts
import { scoreSession } from "@/lib/scoring";
```

- [ ] **Step 5: Verify typecheck, tests, and the heuristic tests still pass**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run test:contracts 2>&1 | grep -iE "scoring|passed"`
Expected: `scoring.confusionPenalty` and `scoring.traineeOnly` still PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/scoring.ts "app/api/session/[id]/complete/route.ts" "app/api/session/[id]/end/route.ts" "app/api/session/[id]/message/route.ts"
git commit -m "refactor: retain heuristic scoring as fallback behind async scoreSession"
```

---

## Task 2: The versioned rubric

The rubric anchors and the judge's system prompt live in a data file so they can be tuned
without touching logic — mirroring how the attendee prompt bundle is versioned.

**Files:**
- Create: `lib/scoring/rubric.ts`

- [ ] **Step 1: Write the rubric module**

Create `lib/scoring/rubric.ts`:

```ts
/**
 * The scoring rubric: anchored 0-5 scales per dimension and the judge's system prompt.
 *
 * Kept as data, separate from judge logic, so the anchors can be tuned against SME feedback
 * without a code change. Versioned for the same reason.
 */

import type { SessionState } from "../storage";
import { getTraineeMessages } from "../scoringInput";

export const RUBRIC_VERSION = "score-rubric-v1";

/** The five dimensions, in the order the judge must return them. */
export const SCORING_DIMENSIONS = [
  "listening",
  "discovery",
  "empathy",
  "otel_assumptions",
  "guardrails",
] as const;

export type ScoringDimension = (typeof SCORING_DIMENSIONS)[number];

const ANCHORS = `
LISTENING - did the trainee actually hear the attendee?
0: Ignores answers; repeats questions already answered.
1: Asks mostly scripted questions unrelated to what was said.
2: Acknowledges answers but misses the signal in them.
3: Generally follows up on what the attendee actually said.
4: Reflects the attendee's point in their own terms and probes it.
5: Reflects and adapts the line of questioning to what was heard, without parroting.
Note: reflection does NOT require set phrases. "It can feel like you're starting over each
time" is a 4-5 reflection even though it contains no "sounds like".

DISCOVERY - did questions uncover the real situation?
0: No discovery; pitches or talks at the attendee.
1: Surface questions only; learns nothing usable.
2: Learns role OR tooling, but not pain or impact.
3: Uncovers role and tooling and at least one real pain.
4: Uncovers pain AND its impact in the attendee's own words.
5: Builds a full picture - role, tooling, pain, impact, and what a better state looks like.
Note: score the INFORMATION uncovered, never the number of questions asked.

EMPATHY - did validation fit this persona?
0: Dismissive or transactional.
1: Generic pleasantries with no connection to what was said.
2: Some acknowledgement but mistimed or mismatched to the persona.
3: Appropriate acknowledgement of the attendee's situation.
4: Validation that fits the persona (business impact for a buyer, frustration for an IC).
5: Well-timed, specific validation that visibly opens the attendee up.

OTEL_ASSUMPTIONS - did the trainee gauge OpenTelemetry maturity rather than assume it?
0: Asserts the attendee's OTel state incorrectly and builds on the wrong assumption.
2: Assumes OTel maturity without checking, but it happens to fit.
3: Neutral; neither assumes nor probes.
4: Asks about OTel status before relying on it.
5: Asks, and adapts the conversation to the actual maturity level.
Note: judge against the attendee's ACTUAL hidden familiarity, provided below.

GUARDRAILS - restraint and honesty.
0: Early pitch, jargon dump, over-promising, or bluffing deep technical answers.
2: Some premature pitching or unearned product talk.
3: Mostly restrained; minor slips.
4: Stays high-level, avoids jargon, pitches only after pain and relevance are established.
5: Textbook restraint, and escalates deep technical questions instead of bluffing.
`.trim();

export const JUDGE_SYSTEM_PROMPT = `
You are an expert sales-coaching evaluator for Honeycomb booth-conversation training. You
score how the TRAINEE (the booth staffer) conducted a discovery conversation with a simulated
conference attendee. Score only the trainee's behavior; the attendee's lines are context.

Score each of five dimensions from 0 to 5 using these anchors:

${ANCHORS}

Rules:
- Base every score on what the trainee actually did. Do not reward product knowledge that did
  not help the conversation.
- Evidence is required. For each dimension, quote the trainee's own words (verbatim) that
  justify the score. If you cannot quote evidence for a score above 3, the score must be 3 or
  lower. Empty evidence with a high score is not allowed.
- LLMs tend to over-praise. Anchor 4 and 5 are demanding; most competent-but-ordinary
  conversations sit at 3.
- Reflection and empathy are about intent and fit, never about specific phrases.

Return ONLY a JSON object, no prose, in exactly this shape:
{
  "listening":        { "score": <0-5>, "rationale": "<one line>", "evidence": "<verbatim trainee quote or \\"\\">" },
  "discovery":        { "score": <0-5>, "rationale": "<one line>", "evidence": "<verbatim trainee quote or \\"\\">" },
  "empathy":          { "score": <0-5>, "rationale": "<one line>", "evidence": "<verbatim trainee quote or \\"\\">" },
  "otel_assumptions": { "score": <0-5>, "rationale": "<one line>", "evidence": "<verbatim trainee quote or \\"\\">" },
  "guardrails":       { "score": <0-5>, "rationale": "<one line>", "evidence": "<verbatim trainee quote or \\"\\">" },
  "summary": "<1-2 sentence overall read>"
}
`.trim();

/**
 * Render the transcript and hidden context the judge scores against. The hidden profile is
 * included so the judge can assess OTel-assumption accuracy and persona fit.
 */
export function buildJudgeUserMessage(session: SessionState): string {
  const lines: string[] = [];

  lines.push("HIDDEN ATTENDEE PROFILE (the trainee could not see this):");
  lines.push(session.kickoff.attendeeProfile || "(none provided)");
  lines.push("");

  const detected = session.detectedOutcome?.type;
  if (detected) lines.push(`DETECTED OUTCOME: ${detected}`);
  lines.push("");

  lines.push("TRANSCRIPT (score the Trainee turns only):");
  for (const m of session.transcript) {
    if (m.type === "system") continue;
    const role = m.type === "trainee" ? "Trainee" : "Attendee";
    lines.push(`${role}: ${m.text}`);
  }

  return lines.join("\n");
}

/** True when the trainee said anything at all - a guard against scoring an empty session. */
export function hasTraineeContent(session: SessionState): boolean {
  return getTraineeMessages(session.transcript).length > 0;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/scoring/rubric.ts
git commit -m "feat: add versioned scoring rubric and judge prompt"
```

---

## Task 3: Judge types and defensive parser

The parser is the trust boundary. It is pure and fully unit-tested: any malformed judge output
must be rejectable so the orchestrator can fall back.

**Files:**
- Create: `lib/scoring/judge.ts`
- Create: `lib/scoring/judge.test.ts`

- [ ] **Step 1: Write the failing parser tests**

Create `lib/scoring/judge.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseJudgeResult } from "./judge";

const good = {
  listening:        { score: 4, rationale: "reflected the pain", evidence: "starting over each time" },
  discovery:        { score: 5, rationale: "full picture", evidence: "what do you use now" },
  empathy:          { score: 3, rationale: "ok", evidence: "that sounds rough" },
  otel_assumptions: { score: 2, rationale: "assumed", evidence: "since you're on otel" },
  guardrails:       { score: 4, rationale: "restrained", evidence: "" },
  summary:          "Solid discovery.",
};

describe("parseJudgeResult", () => {
  it("parses a well-formed object", () => {
    const r = parseJudgeResult(JSON.stringify(good));
    expect(r.listening.score).toBe(4);
    expect(r.discovery.evidence).toBe("what do you use now");
    expect(r.summary).toBe("Solid discovery.");
  });

  it("strips markdown code fences before parsing", () => {
    const fenced = "```json\n" + JSON.stringify(good) + "\n```";
    expect(parseJudgeResult(fenced).listening.score).toBe(4);
  });

  it("throws on unparseable text", () => {
    expect(() => parseJudgeResult("not json at all")).toThrow();
  });

  it("throws when a dimension is missing", () => {
    const { discovery, ...rest } = good;
    expect(() => parseJudgeResult(JSON.stringify(rest))).toThrow();
  });

  it("throws when a score is out of range", () => {
    const bad = { ...good, listening: { ...good.listening, score: 9 } };
    expect(() => parseJudgeResult(JSON.stringify(bad))).toThrow();
  });

  it("throws when a score is not an integer", () => {
    const bad = { ...good, empathy: { ...good.empathy, score: 2.5 } };
    expect(() => parseJudgeResult(JSON.stringify(bad))).toThrow();
  });

  it("defaults missing evidence/rationale to empty strings", () => {
    const noEv = { ...good, guardrails: { score: 3 } };
    const r = parseJudgeResult(JSON.stringify(noEv));
    expect(r.guardrails.evidence).toBe("");
    expect(r.guardrails.rationale).toBe("");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- judge`
Expected: FAIL — "Failed to resolve import ./judge".

- [ ] **Step 3: Write the types and parser**

Create `lib/scoring/judge.ts`:

```ts
/**
 * The LLM judge: sends the transcript to the chat provider and returns validated per-dimension
 * scores with evidence. Knows nothing about ScoreRecord or grades - that mapping lives in
 * lib/scoring.ts.
 */

import type { SessionState } from "../storage";
import { getChatProvider } from "../llm/chatProvider";
import {
  JUDGE_SYSTEM_PROMPT,
  buildJudgeUserMessage,
  SCORING_DIMENSIONS,
  type ScoringDimension,
} from "./rubric";

export interface JudgeDimension {
  score: number; // integer 0-5
  rationale: string;
  evidence: string; // verbatim trainee quote, or ""
}

export type JudgeResult = Record<ScoringDimension, JudgeDimension> & {
  summary: string;
};

function coerceDimension(raw: unknown): JudgeDimension {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("dimension is not an object");
  }
  const r = raw as Record<string, unknown>;
  const score = r.score;
  if (typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > 5) {
    throw new Error(`invalid score: ${String(score)}`);
  }
  return {
    score,
    rationale: typeof r.rationale === "string" ? r.rationale : "",
    evidence: typeof r.evidence === "string" ? r.evidence : "",
  };
}

/**
 * Parse and validate the judge's JSON. Throws on anything malformed so the caller can fall
 * back to the heuristic scorer rather than trust a partial result.
 */
export function parseJudgeResult(text: string): JudgeResult {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned) as Record<string, unknown>;

  const result = { summary: "" } as JudgeResult;
  for (const dim of SCORING_DIMENSIONS) {
    if (!(dim in parsed)) throw new Error(`missing dimension: ${dim}`);
    result[dim] = coerceDimension(parsed[dim]);
  }
  result.summary = typeof parsed.summary === "string" ? parsed.summary : "";
  return result;
}

/**
 * Run the judge against a completed session. Throws if the provider fails or returns
 * unparseable output; the orchestrator catches and falls back.
 */
export async function judgeSession(session: SessionState): Promise<JudgeResult> {
  const provider = getChatProvider();
  const result = await provider.generate({
    systemPrompt: JUDGE_SYSTEM_PROMPT,
    conversation: [{ role: "user", content: buildJudgeUserMessage(session) }],
    sessionId: `judge-${session.id}`,
  });
  return parseJudgeResult(result.text);
}
```

- [ ] **Step 4: Run the parser tests**

Run: `npm test -- judge`
Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/scoring/judge.ts lib/scoring/judge.test.ts
git commit -m "feat: add LLM judge with a defensive result parser"
```

---

## Task 4: Async orchestrator — map, grade, nudge, fallback

Wire the judge into `scoreSession`: map 0–5 → 0–20, derive the grade with no outcome floor,
apply the conduct-gated outcome nudge, populate `evidence`/`scoringMethod`, and fall back to
`heuristicScore` on any judge failure.

**Files:**
- Modify: `lib/scoring.ts`
- Modify: `lib/scoring/judge.test.ts` (add orchestrator tests)

- [ ] **Step 1: Extend `ScoreRecord` with the additive fields**

In `lib/scoring.ts`, add to the `ScoreRecord` interface (after `violations`):

```ts
  /** Per-dimension evidence quotes from the LLM judge (empty when heuristic-scored). */
  evidence: { dimension: string; quote: string; comment: string }[];
  /** Which path produced this score. */
  scoringMethod: "judge" | "heuristic";
```

- [ ] **Step 2: Ensure `heuristicScore` populates the new fields**

In `heuristicScore`'s return object (the block ending the function), add before the closing
brace:

```ts
    evidence: [],
    scoringMethod: "heuristic",
```

- [ ] **Step 3: Write the failing orchestrator tests**

Add to `lib/scoring/judge.test.ts`:

```ts
import { judgeResultToScore, deriveGrade } from "./judge-mapping";

const base = (over: Partial<Record<string, { score: number }>> = {}) => ({
  listening:        { score: 3, rationale: "", evidence: "x" },
  discovery:        { score: 3, rationale: "", evidence: "x" },
  empathy:          { score: 3, rationale: "", evidence: "x" },
  otel_assumptions: { score: 3, rationale: "", evidence: "x" },
  guardrails:       { score: 3, rationale: "", evidence: "x" },
  summary: "",
  ...over,
});

describe("judgeResultToScore", () => {
  it("maps 0-5 to 0-20 per dimension", () => {
    const { breakdown } = judgeResultToScore(base({ listening: { score: 4, rationale: "", evidence: "x" } }) as any, null);
    expect(breakdown.listening).toBe(16); // 4/5*20
    expect(breakdown.discovery).toBe(12); // 3/5*20
  });

  it("populates evidence from each dimension", () => {
    const { evidence } = judgeResultToScore(base() as any, null);
    expect(evidence).toHaveLength(5);
    expect(evidence[0].dimension).toBe("listening");
  });
});

describe("deriveGrade — no outcome floor", () => {
  it("gives a high-quality polite exit a better grade than a low-quality MQL", () => {
    const goodExit = judgeResultToScore(
      base({ listening: { score: 5, rationale: "", evidence: "x" }, discovery: { score: 5, rationale: "", evidence: "x" }, empathy: { score: 4, rationale: "", evidence: "x" } }) as any,
      "POLITE_EXIT"
    );
    const badMql = judgeResultToScore(
      base({ listening: { score: 1, rationale: "", evidence: "" }, discovery: { score: 1, rationale: "", evidence: "" } }) as any,
      "BADGE_SCAN"
    );
    expect(goodExit.score).toBeGreaterThan(badMql.score);
    expect(deriveGrade(goodExit.score)).not.toBe("F");
  });

  it("withholds the outcome nudge when discovery or listening scored below 3", () => {
    const withNudge = judgeResultToScore(base() as any, "BADGE_SCAN").score;      // both == 3
    const noNudge = judgeResultToScore(
      base({ discovery: { score: 2, rationale: "", evidence: "" } }) as any,
      "BADGE_SCAN"
    ).score;
    // base without nudge = 60; +5 nudge = 65. Low-discovery case gets 20+8+12+12+12=... < with-nudge.
    expect(withNudge).toBe(65);
    expect(noNudge).toBeLessThan(withNudge);
  });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `npm test -- judge`
Expected: FAIL — "Failed to resolve import ./judge-mapping".

- [ ] **Step 5: Write the mapping module**

Create `lib/scoring/judge-mapping.ts`:

```ts
/**
 * Pure mapping from a JudgeResult to score fields. Separated from judge.ts (which does I/O)
 * and from scoring.ts (which assembles the full record) so the arithmetic is unit-testable
 * without a provider.
 */

import type { JudgeResult } from "./judge";
import { SCORING_DIMENSIONS } from "./rubric";

export interface MappedScore {
  breakdown: {
    listening: number;
    discovery: number;
    empathy: number;
    otel_assumptions: number;
    guardrails: number;
  };
  score: number; // 0-100 including the outcome nudge
  evidence: { dimension: string; quote: string; comment: string }[];
}

const SUCCESS_OUTCOMES = new Set(["DEMO", "BADGE_SCAN", "DEMO_READY", "MQL_READY"]);

function to20(score05: number): number {
  return Math.round((score05 / 5) * 20);
}

export function judgeResultToScore(
  judge: JudgeResult,
  detectedOutcome: string | null
): MappedScore {
  const breakdown = {
    listening: to20(judge.listening.score),
    discovery: to20(judge.discovery.score),
    empathy: to20(judge.empathy.score),
    otel_assumptions: to20(judge.otel_assumptions.score),
    guardrails: to20(judge.guardrails.score),
  };

  let score =
    breakdown.listening +
    breakdown.discovery +
    breakdown.empathy +
    breakdown.otel_assumptions +
    breakdown.guardrails;

  // Outcome informs, does not floor. The nudge is withheld unless the conversation was
  // actually conducted well, so closing cannot rescue a poorly-run session.
  const earned = judge.discovery.score >= 3 && judge.listening.score >= 3;
  if (detectedOutcome && SUCCESS_OUTCOMES.has(detectedOutcome) && earned) {
    score += 5;
  }

  score = Math.min(100, Math.max(0, score));

  const evidence = SCORING_DIMENSIONS.map((dim) => ({
    dimension: dim,
    quote: judge[dim].evidence,
    comment: judge[dim].rationale,
  }));

  return { breakdown, score, evidence };
}

export function deriveGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A";
  if (score >= 78) return "B";
  if (score >= 65) return "C";
  if (score >= 50) return "D";
  return "F";
}
```

- [ ] **Step 6: Run the mapping tests**

Run: `npm test -- judge`
Expected: all tests PASS (parser + mapping).

- [ ] **Step 7: Wire the judge into `scoreSession`**

Replace the body of the async `scoreSession` added in Task 1 with:

```ts
export async function scoreSession(
  session: SessionState,
  token: string
): Promise<ScoreRecord> {
  const now = new Date().toISOString();
  const base = heuristicScore(session, token); // also our fallback

  if (!hasTraineeContent(session)) return base;

  try {
    const judge = await judgeSession(session);
    const mapped = judgeResultToScore(judge, session.detectedOutcome?.type ?? null);

    const ranked = SCORING_DIMENSIONS.map((d) => ({ d, s: judge[d].score }));
    const highlights = ranked
      .filter((r) => r.s >= 4)
      .map((r) => `${label(r.d)}: ${judge[r.d].rationale}`)
      .slice(0, 6);
    const mistakes = ranked
      .filter((r) => r.s <= 2)
      .map((r) => `${label(r.d)}: ${judge[r.d].rationale}`)
      .slice(0, 6);

    return {
      ...base,
      score: mapped.score,
      grade: deriveGrade(mapped.score),
      breakdown: mapped.breakdown,
      highlights: highlights.length ? highlights : base.highlights,
      mistakes: mistakes.length ? mistakes : base.mistakes,
      evidence: mapped.evidence,
      scoringMethod: "judge",
      completedAt: now,
    };
  } catch (err) {
    console.warn(
      "[scoring] judge failed, using heuristic fallback:",
      err instanceof Error ? err.message : "unknown error"
    );
    return base;
  }
}

function label(d: string): string {
  return d
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
```

Add imports at the top of `lib/scoring.ts`:

```ts
import { judgeSession } from "./scoring/judge";
import { judgeResultToScore, deriveGrade } from "./scoring/judge-mapping";
import { SCORING_DIMENSIONS, hasTraineeContent } from "./scoring/rubric";
```

- [ ] **Step 8: Verify typecheck and the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test && npm run test:contracts 2>&1 | grep -E "passed|FAIL"`
Expected: vitest all pass; contracts unchanged (20/21 — `continuityContract` is the
pre-existing failure).

- [ ] **Step 9: Commit**

```bash
git add lib/scoring.ts lib/scoring/judge-mapping.ts lib/scoring/judge.test.ts
git commit -m "feat: score sessions with the LLM judge, mapping and grade with no outcome floor"
```

---

## Task 5: Live end-to-end on the real transcript

Prove the reported defect is fixed: the real TDM session's reflection must no longer score at
the Listening floor. This is a manual live check (needs a working `CHAT_PROVIDER`), not a
committed unit test, because it calls the model.

**Files:**
- Create: `scripts/score-real-transcript.mjs`

- [ ] **Step 1: Write the script**

Create `scripts/score-real-transcript.mjs`. It reconstructs a minimal session from the real
transcript's key turns and scores it. (The full transcript is in the user's export; these are
the load-bearing turns.)

```js
// Usage: NODE_ENV=development node --env-file=.env.local --import tsx scripts/score-real-transcript.mjs
import { scoreSession } from "../lib/scoring.ts";

const t = (type, text) => ({ id: Math.random().toString(36).slice(2), type, text, timestamp: new Date().toISOString() });

const session = {
  id: "real-tdm",
  currentState: "OUTCOME",
  active: false,
  startTime: new Date().toISOString(),
  violations: ["Assumed OTel familiarity without asking"],
  detectedOutcome: { type: "BADGE_SCAN", detectedAt: new Date().toISOString(), detectedFrom: "attendee" },
  kickoff: {
    personaId: "tdm-canonical",
    personaDisplayName: "Technical Decision-Maker",
    attendeeProfile: "Persona: Technical Decision-Maker\\nModifiers: buyer, team-focused\\nEmotional posture: outcome-driven\\nTooling bias: Datadog + homegrown logging\\nOpenTelemetry familiarity: aware",
  },
  transcript: [
    t("trainee", "Hi! How's your conference going so far?"),
    t("attendee", "It's fine, a bit of a blur. Mostly here scouting what might help my team ship faster without burning everyone out."),
    t("trainee", "What does the company do and what is your role in it?"),
    t("attendee", "Mid-size fintech, I run a couple platform teams, about twenty engineers across payments infra and internal tooling."),
    t("trainee", "That sounds rough and a huge challenge. What do you use now to solve issues and why is it falling short?"),
    t("attendee", "Datadog for metrics and alerts, plus homegrown logging. When payments breaks it takes forever to get from alert to root cause. Last incident took almost four hours."),
    t("trainee", "I hear that. Having to switch tools means switching context. The next tool in the runbook doesn't always have signal overlap with the last one. It can feel like you are starting over each time"),
    t("attendee", "Yeah, exactly. So if there's a way to keep that context intact, how does that actually work?"),
    t("trainee", "Honeycomb is a single pane where you can drill down without switching tools. If your code is instrumented you can follow the customer journey end to end. It works alongside your existing metrics and logs, especially with OpenTelemetry."),
    t("attendee", "We've dabbled with OpenTelemetry but not gone all-in. What's the lift to get useful data in?"),
    t("trainee", "It can be a big lift and slowing the team is the last thing we want. OpenTelemetry has auto-instrumentation for common codebases, and we'd give you a dedicated person to help transition. We can schedule a POC against your current stack."),
    t("attendee", "That's reasonable. Can you get me in touch with someone who can talk through what that POC looks like for our stack?"),
    t("trainee", "I'd be happy to, let me scan your badge and we can have a team member reach out."),
  ],
};

const record = await scoreSession(session, "real-tdm-token");
console.log("method:", record.scoringMethod, "| grade:", record.grade, "| score:", record.score);
console.log("breakdown:", record.breakdown);
console.log("listening evidence:", record.evidence.find((e) => e.dimension === "listening"));
```

- [ ] **Step 2: Run it**

Run: `NODE_ENV=development node --env-file=.env.local --import tsx scripts/score-real-transcript.mjs`

Expected: `method: judge`, and `breakdown.listening` clearly above the old floor — target ≥ 12
(i.e. judge Listening ≥ 3), with the listening evidence quoting the "starting over each time"
reflection. If `method: heuristic`, the provider is not configured — set `CHAT_PROVIDER` and
`ATTENDEE_MODEL` (Anthropic) or `OPENAI_CHAT_MODEL`, then rerun.

- [ ] **Step 3: Commit the script**

```bash
git add scripts/score-real-transcript.mjs
git commit -m "test: add live scoring check against the real TDM transcript"
```

---

## Self-Review

**Spec coverage:** §4 architecture → Tasks 1, 3, 4. §4.1 judge contract → Task 3.
§4.2 mapping/grade → Task 4 (`judge-mapping.ts`). §4.3 outcome nudge (conduct-gated, no floor)
→ Task 4 mapping + tests. §5 rubric anchors → Task 2. §6 error handling / fallback →
Task 4 step 7 (try/catch) + Task 3 parser throwing. §6 `scoringMethod` field → Task 4 step 1.
§7 testing (contract + live E2E) → Tasks 3, 4, 5. §8 files → all tasks. §3 preserve
`ScoreRecord`, additive only → Task 4 step 1 (fields appended). Call-site changes / dead
import → Task 1.

**Placeholder scan:** no TBD/TODO; every code step shows complete code.

**Type consistency:** `JudgeResult` (Task 3) is consumed by `judgeResultToScore` (Task 4) with
matching per-dimension `.score`/`.evidence`/`.rationale`. `MappedScore.breakdown` keys match
`ScoreRecord.breakdown` keys (`otel_assumptions`, not `otelAssumptions`). `SCORING_DIMENSIONS`
(Task 2) is the single source of dimension order, imported by Tasks 3 and 4. `deriveGrade`
thresholds match the spec (A≥90, B≥78, C≥65, D≥50, F<50).

**One deviation from the spec, on the record:** the spec put mapping/grade inside
`lib/scoring.ts`. The plan extracts them to `lib/scoring/judge-mapping.ts` so the arithmetic is
unit-testable without a provider or a full `SessionState`. Same behavior, better seam — this is
the "design for testability" the spec's §7 implies.
