# Scoring v2 — LLM Judge with a Heuristic Net

**Date:** 2026-08-19
**Status:** Awaiting review
**Scope:** Session scoring only. The attendee realism engine (Phase 1 + C) is done and separate.

---

## 1. Why this work exists

The scorecard teaches the wrong lesson. In the first real training session, a Technical
Decision-Maker conversation that ran well produced this:

- **Listening: 5/20** — the floor — with "Lacked active listening and reflection" in Areas
  for Improvement.
- **Discovery: 20/20** — maxed.

The trainee's single best moment was this reflection, which unlocked the attendee's war story:

> "Having to switch tools means switching context. The next tool in the runbook doesn't always
> have signal overlap with the last one. It can feel like you are starting over each time."

That is active listening. It scored the floor because `lib/scoring.ts` counts fixed phrases:

```ts
const listeningMarkers = ["it sounds like", "so you're saying", "what i'm hearing", ...];
listening = min(20, matchCount * 3 + base);   // the trainee said "I hear that" -> 0 matches -> 5
```

Meanwhile Discovery is `questionCount * 2 + openEndedCount * 3`, so it pays per question mark
and maxes trivially. A trainee coached by this scorecard would learn to say "sounds like" and
to ask more questions — not to listen. The scorer rewards the opposite of the skill.

This is the same inverse-signal defect already found and fixed in `personaValidation.test.ts`
(which asserted pain must surface at the icebreaker) and in the reply-ownership work. Keyword
counting cannot recognize intent; it recognizes vocabulary.

---

## 2. Goals and non-goals

### Goals

1. Recognize a real reflection that does not contain a magic phrase.
2. Stop paying flat per question mark.
3. Cite the trainee's own words as evidence for each dimension score.
4. Stop a well-outcome, badly-conducted conversation from being rescued by an outcome floor.
5. Never leave a completed session without a score.

### Non-goals (deferred, with intent)

- **Dimension redesign.** The current five (Listening, Discovery, Empathy, OTel Assumptions,
  Guardrails) are debatable — OTel Assumptions as a full fifth of the grade is odd for a booth
  conversation, and there is no dimension for qualification or handoff quality, both of which
  the handoff doc lists as core skills. Redesigning changes the `ScoreRecord` shape and ripples
  through every consumer. Separate spec, after judged scores exist on real transcripts.
- **SME rubric calibration.** Blind human scoring against the rubric to validate the anchors
  needs a corpus of real transcripts first. Separate effort.
- **Review-UI rendering of evidence.** The data field ships here; the scorecard rendering of
  it is a small follow-up, not this spec.

---

## 3. Current shape and its consumers

`scoreSession(session, token): ScoreRecord` is **synchronous**, actually called at two sites:
`app/api/session/[id]/complete/route.ts` and `.../end/route.ts`. The `message` route imports it
but never calls it (a dead import, removed here).

`ScoreRecord` is consumed by the leaderboard, insights, admin, and share pages. Its shape must
be preserved (additive changes only):

```ts
interface ScoreRecord {
  token; sessionId; personaId?;
  score: number;                       // 0-100
  grade: "A"|"B"|"C"|"D"|"F";
  breakdown: { listening; discovery; empathy; otel_assumptions; guardrails };  // each 0-20
  highlights: string[];
  mistakes: string[];
  violations: string[];
  createdAt; completedAt;
  personaDisplayName?; traineeId?; traineeNameShort?;
}
```

---

## 4. Architecture

```
scoreSession(session, token)  [now async]
      |
      ├─ judgeSession(session)  ──►  chat provider (existing)  ──►  structured JSON
      |     0-5 per dimension + rationale + verbatim trainee quote
      |
      ├─ on success: map 0-5 → 0-20, derive grade from the judged total, assemble ScoreRecord
      |
      └─ on ANY failure (provider down, invalid JSON, missing dimension):
            heuristicScore(session, token)   [today's logic, retained]
```

Three units, one job each:

- **`lib/scoring/judge.ts`** — builds the judge prompt, calls the provider, parses and
  validates the JSON. Returns a typed `JudgeResult` or throws. Knows nothing about
  `ScoreRecord` or grades.
- **`lib/scoring/rubric.ts`** — the versioned rubric text (anchors per dimension) and the
  judge system prompt. A data file, tunable without touching logic, mirroring how the attendee
  prompt bundle is versioned.
- **`lib/scoring.ts`** — `scoreSession` orchestrates: judge → map → assemble, or fall back.
  `heuristicScore` is the current implementation, kept intact as the net.

### 4.1 Judge output contract

```ts
interface JudgeDimension {
  score: number;         // 0-5, integer
  rationale: string;     // one line: why this score
  evidence: string;      // verbatim trainee quote, or "" if none applies
}

interface JudgeResult {
  listening: JudgeDimension;
  discovery: JudgeDimension;
  empathy: JudgeDimension;
  otel_assumptions: JudgeDimension;
  guardrails: JudgeDimension;
  summary: string;       // 1-2 sentence overall read
}
```

The provider is asked for JSON only. Parsing is defensive: any missing dimension, any score
outside 0–5, or unparseable output triggers the fallback. The judge is given the transcript
with roles, the persona's hidden profile (so it can judge OTel-assumption accuracy and
persona-fit), and the detected outcome.

### 4.2 Mapping and grade

- `breakdown.<dim> = round(judge.<dim>.score / 5 * 20)`.
- `score = sum(breakdown)` (0–100), then a small signed outcome nudge (see 4.3).
- Grade from the total, no outcome floor:
  `A ≥ 90, B ≥ 78, C ≥ 65, D ≥ 50, F < 50`.
- `evidence` (new field) = the five dimensions' `{dimension, quote, comment}`.
- `highlights` / `mistakes` are drawn from the judge's rationales (highest-scoring dimensions
  become highlights, lowest become mistakes), so the existing string-array fields stay
  populated and meaningful.

### 4.3 Outcome informs, does not floor

The current outcome-based grade floors are removed (a bulldozed MQL no longer guarantees a B).
Replaced by a small signed nudge applied to the total, never a floor:

- Earned demo/MQL (reached with adequate discovery per the judge): `+5`.
- Rushed or unearned close: `0`.
- A clean polite exit is not penalized — it can outscore a badly-conducted MQL, matching the
  design principle that a correct disqualification is a successful outcome.

"Earned" is the judge's call, not a keyword check: the nudge is applied only when Discovery and
Listening both scored ≥ 3, so the outcome bonus cannot rescue a conversation the judge already
marked as poorly conducted.

---

## 5. The rubric

Five dimensions, each with a 0–5 anchor scale. Listening, as the pattern:

| Score | Listening |
|---|---|
| 0 | Ignores answers; repeats questions already answered. |
| 1 | Asks mostly scripted questions unrelated to what was said. |
| 2 | Acknowledges answers but misses the signal in them. |
| 3 | Generally follows up on what the attendee actually said. |
| 4 | Reflects the attendee's point in his own terms and probes it. |
| 5 | Reflects and adapts the line of questioning to what was heard, without parroting. |

The session's *"you are starting over each time"* reflection lands at 4–5 here — the concrete
target of the fix. The same anchor treatment is written for:

- **Discovery** — anchored on whether questions uncovered role, tooling, pain, and impact in
  the attendee's own words; explicitly not on question count.
- **Empathy** — validation that fit the persona (an executive wants business-impact
  acknowledgement, an IC wants frustration acknowledged); not a count of sympathy phrases.
- **OTel Assumptions** — did the trainee ask about OTel maturity rather than assume it? Scored
  against the persona's actual hidden familiarity.
- **Guardrails** — restraint: no early pitch, no jargon dump, correct escalation of deep
  technical questions; the existing violation list feeds this.

The full anchor text lives in `lib/scoring/rubric.ts` with a version string, so it can be tuned
against SME feedback later without a code change.

---

## 6. Error handling

| Failure | Behavior |
|---|---|
| Provider throws / times out | Log, fall back to `heuristicScore`. Session still scored. |
| JSON unparseable | One reparse attempt (strip code fences), then fall back. |
| Missing dimension or out-of-range score | Fall back — do not partially trust a malformed judge. |
| `CHAT_PROVIDER` unset (mock) | Mock returns non-JSON → fall back. Local dev still scores. |

A `scoringMethod: "judge" | "heuristic"` field is added to `ScoreRecord` so it is always
visible which path produced a score — important when reading results during calibration.

---

## 7. Testing

The judge needs a live model, so unit tests assert the **contract**, not model output:

- A mocked `JudgeResult` maps to the correct `breakdown` (0–5 → 0–20 scaling).
- Malformed judge JSON triggers `heuristicScore` (fallback fires).
- Grade derives from the total with no outcome floor: a high-quality polite exit outscores a
  low-quality MQL on fixed mocked inputs.
- The outcome nudge is withheld when Discovery or Listening scored < 3.
- `evidence` is populated from the judge dimensions; `highlights`/`mistakes` remain non-empty.

Plus one scripted end-to-end (live, run manually) on the real TDM transcript from the first
session: assert Listening now scores in the 3–5 band rather than at the floor. This is the
regression that proves the reported defect is fixed.

`heuristicScore` keeps its current behavior and its existing tests
(`scoring.confusionPenalty`, `scoring.traineeOnly`) continue to pass — it is retained
verbatim as the fallback, not rewritten.

---

## 8. Files touched

**Added:** `lib/scoring/judge.ts`, `lib/scoring/rubric.ts`, `lib/scoring/judge.test.ts`

**Modified:** `lib/scoring.ts` (`scoreSession` becomes async: judge → map → assemble, or fall
back to the retained `heuristicScore`; `ScoreRecord` gains `evidence` and `scoringMethod`),
`app/api/session/[id]/complete/route.ts` and `.../end/route.ts` (await the now-async
`scoreSession`); `.../message/route.ts` (remove the dead `scoreSession` import).

**Untouched:** the attendee engine, the leaderboard/insights/admin/share consumers (additive
`ScoreRecord` changes only), `heuristicScore`'s existing tests.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| Judge latency at END SESSION | One call, no loop; acceptable at session end. Fallback covers a timeout. |
| Judge is inconsistent run to run | Report `scoringMethod`; rubric is versioned for tuning; SME calibration is the follow-up that hardens it. |
| Async change breaks a call site | Both real call sites are already inside async route handlers; adding `await` is mechanical, and typecheck catches a miss. |
| Judge over-generous (LLMs praise) | The rubric anchors are explicit about what a 4 vs a 2 requires, and the prompt instructs evidence-or-lower — a score with no quotable evidence must not exceed 3. |
