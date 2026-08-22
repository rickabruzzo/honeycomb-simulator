# Scoring v3 — Booth-Arc Dimensions

**Date:** 2026-08-20
**Status:** Approved (design), awaiting spec review
**Scope:** The scoring dimension set only. Builds on Scoring v2 (the LLM judge with a heuristic
net, see `2026-08-19-scoring-llm-judge-design.md`), which is done and shipped. The judge
architecture, evidence citation, and heuristic fallback are unchanged; only *what* is scored
changes.

---

## 1. Why this work exists

Scoring v2 fixed *how* dimensions are scored (an LLM judge citing the trainee's own words
against anchored 0–5 rubrics, no keyword counting, no outcome floor). It deliberately left the
dimension *set* alone. That set has two known defects, both flagged in the v2 spec:

1. **OTel Assumptions is a full fifth of the grade.** Whether the trainee gauged OpenTelemetry
   maturity is one useful signal inside discovery — not 20% of a booth conversation's grade,
   co-equal with listening or discovery. It over-weights a single domain check.
2. **No dimension for qualification or handoff.** The handoff doc lists both as core booth
   skills. Today a trainee can be scored well while never establishing whether this is a real
   opportunity, and while fumbling (or skipping) the next step. Worse, nothing rewards a
   *correct disqualification* — walking a non-fit to a clean, polite exit — which the project's
   design principle treats as a successful outcome.

This redesign replaces the five v2 dimensions with a six-dimension **booth arc** that mirrors
how a good discovery conversation actually runs, folds OTel into discovery, and makes
qualification and handoff first-class.

---

## 2. Goals and non-goals

### Goals

1. Score the full booth arc: discovery → listening → empathy → qualification → guardrails →
   handoff.
2. Demote OTel-assumption accuracy from a standalone dimension to a scored check *inside*
   discovery.
3. Make **Qualification** (the read on whether this is a real opportunity) and **Handoff** (the
   next step secured, or a clean disqualifying exit) first-class dimensions.
4. Reward a correct disqualification as a success, not a failure.
5. Remove the outcome nudge — outcome now lives entirely in the Handoff dimension, with no
   double-counting.

### Non-goals (deferred, with intent)

- **Weighting.** All six dimensions are equal weight in v3. Non-equal weighting is exactly what
  SME rubric calibration (the next deferred item) is for — tune it against real transcripts
  rather than guessing now.
- **SME rubric calibration.** Blind human scoring against the new anchors, on a corpus of real
  transcripts, is a separate effort that this redesign unblocks (it produces the judged
  transcripts that calibration needs).
- **Migrating historical scores.** Old records keep their old five-key breakdown; see §6.

---

## 3. The six dimensions

Each is scored 0–5 by the judge, equal weight.

| Dimension | What it measures |
|---|---|
| **Discovery** | Uncovered the real situation — role, tooling, pain, and impact in the attendee's own words. **OTel-assumption accuracy folds in here:** asserting or assuming the attendee's OpenTelemetry maturity without checking caps Discovery, because it means the trainee built discovery on an unverified assumption. |
| **Listening** | Actually heard the attendee — reflection and adaptive follow-up. No set phrases required (the "starting over each time" reflection is a 4–5). |
| **Empathy** | Validation that fit *this* persona — business impact for a buyer, frustration for an IC — well-timed, not generic pleasantries. |
| **Qualification** | The **read**: did the trainee gauge fit, need, and authority and reach the right conclusion about whether this is a real, pursuable opportunity — *including* correctly concluding a non-fit is a non-fit? |
| **Guardrails** | Restraint and honesty — no early pitch, no jargon dump, no over-promising, no bluffing deep technical answers. The existing violations list feeds this. |
| **Handoff** | The **action**: given the read, did the trainee secure the appropriate next step — badge scan / MQL when earned, a scheduled follow-up — **or a clean polite exit when the attendee was correctly disqualified**? A correct disqualification earns full marks. |

Qualification is the *judgment*; Handoff is what the trainee *did* with it. Keeping them
separate lets the scorecard distinguish "read the room right but fumbled the close" from "great
close on an opportunity they never actually qualified."

---

## 4. Architecture (unchanged from v2, re-pointed at six dimensions)

The v2 orchestration stands: `scoreSession` (async) calls the judge, maps the result, assembles
a `ScoreRecord`, or falls back to the retained heuristic on any failure. Three units keep their
jobs; only their dimension list changes.

- **`lib/scoring/rubric.ts`** — `SCORING_DIMENSIONS` becomes the six keys below; `ANCHORS` gets
  0–5 anchor scales for Qualification and Handoff, OTel folded into the Discovery anchors, and
  the OTel dimension removed. `JUDGE_SYSTEM_PROMPT` returns the six-key JSON shape.
  `RUBRIC_VERSION` bumps to `score-rubric-v2`.
- **`lib/scoring/judge.ts` / `judge-mapping.ts`** — parse and map the six dimensions. Defensive
  parsing is unchanged (missing dimension / out-of-range / unparseable → throw → fallback).
- **`lib/scoring.ts`** — assemble the six-key breakdown, drop the outcome nudge, derive the
  grade from the normalized total. Heuristic fallback keeps its current behavior but maps its
  existing signals onto the six keys (see §7).

### 4.1 Dimension keys

```
discovery, listening, empathy, qualification, guardrails, handoff
```

`otel_assumptions` is removed.

### 4.2 Scoring math

- Judge returns each dimension 0–5. Each breakdown value is stored on the **existing 0–20
  scale** (`judge_score × 4`), so the share page's `/20` display and percentage bar need no math
  change and old records render on the same scale.
- `score = round( sum(six 0–20 values) / 120 × 100 )` → 0–100.
- Grade thresholds unchanged: `A ≥ 90, B ≥ 78, C ≥ 65, D ≥ 50, F < 50`.
- **No outcome nudge, no outcome floor.** The v2 `+5` earned-outcome nudge and its
  Discovery/Listening ≥ 3 gate are deleted. Outcome quality is scored only through Handoff.
- `highlights` / `mistakes` are drawn from the six judged rationales exactly as in v2 (strong
  dimensions ≥ 4 become highlights; the weakest become mistakes), so those string arrays stay
  populated and judge-consistent.
- `evidence` is still the per-dimension `{dimension, quote, comment}`, now six entries.

---

## 5. The rubric anchors

New 0–5 anchor scales for the two new dimensions (written in `rubric.ts`; abbreviated here):

**QUALIFICATION** — did the trainee reach the right read on the opportunity?
- 0: Never attempts to gauge fit; treats everyone as a hot lead (or a waste of time) regardless.
- 2: Surface qualification; learns a title but not need, authority, or fit.
- 3: Gauges need or fit, reaches a defensible read.
- 4: Establishes need and fit (and, for a buyer, authority) and acts consistently with that read.
- 5: Reaches an accurate read *including correctly disqualifying a non-fit*, and adapts the
  conversation to it.

**HANDOFF** — did the trainee secure the right next step for the read they reached?
- 0: No next step, or forces an inappropriate one (badge scan on a hard non-fit; MQL with no
  discovery).
- 2: A next step exists but is mistimed or mismatched to the qualification read.
- 3: A reasonable next step, loosely set up.
- 4: The appropriate next step for the read — earned MQL / badge scan, or a clean polite exit
  for a disqualified attendee — clearly set up.
- 5: The right next step, set up so the follow-up (or the exit) is genuinely easy and correct.
- Note: a **correct disqualification is a 4–5**, never penalized as a "lost" outcome.

Discovery's anchors gain the OTel note: *"Assuming or asserting the attendee's OpenTelemetry
maturity without checking caps this at 2 — discovery built on an unverified assumption."*
Listening, Empathy, and Guardrails anchors are carried over from v2 unchanged.

The judge is still given the transcript, the hidden persona profile (needed to judge
qualification fit and OTel accuracy), and the detected outcome (needed to judge handoff).

---

## 6. `ScoreRecord` shape and backward compatibility

`breakdown` changes from the five v2 keys to the six keys in §4.1. This is the only shape
change; `score`, `grade`, `highlights`, `mistakes`, `violations`, `evidence`, `scoringMethod`
are unchanged.

**No migration.** New sessions get the six-key breakdown; existing records keep their five-key
breakdown. This is safe because:

- The **share page** renders `breakdown` dynamically (`Object.entries`), deriving each label
  from its key, so it displays whatever keys a record actually has — old or new.
- **Leaderboard, insights, and admin** read only `score` and `grade`, never per-dimension keys.
- The only typed reference to the five keys is the local `ScoreRecord` interface in the share
  page, which is updated to the six keys (old records still render — the map is over whatever
  keys exist, and TypeScript only types the shape of new reads).

A small **label map** is added to the share page for display names that don't fall out of the
key nicely: `qualification → "Qualification & Fit"`, `handoff → "Next-Step / Handoff"`. All
other keys keep the existing key-to-Title-Case derivation.

---

## 7. Heuristic fallback

`heuristicScore` is retained as the net for when the judge/provider is unavailable. It is
re-mapped, not rewritten, onto the six keys:

- **Discovery, Listening, Empathy, Guardrails** — keep their existing heuristic signals; OTel's
  former contribution folds into the Discovery signal.
- **Qualification** — has no keyword heuristic; derived from discovery depth plus whether the
  detected outcome matches a plausibly-qualified conversation (a floor value when there is not
  enough signal, never left blank).
- **Handoff** — derived from the detected outcome type (earned next step, unearned close, clean
  exit) rather than a keyword scan.

The fallback is explicitly coarse — it exists so a completed session is never left unscored, and
`scoringMethod: "heuristic"` flags it on the scorecard. Precision is the judge's job.

---

## 8. Testing

Contract tests, not model output (the judge needs a live model):

- A mocked six-key `JudgeResult` maps to the correct six-key breakdown (0–5 → 0–20 scaling) and
  normalized score.
- Grade derives from the normalized total with no outcome nudge: a high-quality polite exit
  (strong Handoff via correct disqualification) outscores a low-quality forced MQL on fixed
  mocked inputs — the regression that proves "disqualification is a success" and "no
  double-counting."
- Malformed judge JSON (missing a dimension, out-of-range) triggers the heuristic fallback.
- `evidence` has six entries; `highlights`/`mistakes` remain non-empty and judge-sourced.
- The two retained heuristic tests (`scoring.confusionPenalty`, `scoring.traineeOnly`) are
  updated only where they assert dimension keys; their behavior is otherwise unchanged.

---

## 9. Files touched

**Modified:**
- `lib/scoring/rubric.ts` — six-dimension list, new Qualification/Handoff anchors, OTel folded
  into Discovery, six-key judge JSON shape, `RUBRIC_VERSION → score-rubric-v2`.
- `lib/scoring/judge.ts` / `lib/scoring/judge-mapping.ts` — parse/map six dimensions.
- `lib/scoring.ts` — six-key breakdown, drop the outcome nudge, normalized grade,
  highlights/mistakes over six dimensions.
- `lib/scoring/judge.test.ts`, `lib/__tests__/scoring.confusionPenalty.test.ts`,
  `lib/__tests__/scoring.traineeOnly.test.ts` — expected six keys and the no-nudge grade.
- `app/share/[token]/page.tsx` — six-key `ScoreRecord` type + the label map.

**Untouched:** the judge architecture and evidence rendering, the attendee engine, and the
leaderboard/insights/admin consumers (additive/agnostic to the breakdown keys).

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| Qualification and Handoff overlap and double-score the same behavior | Anchors define them as read (judgment) vs action (next step); the tests assert a case where they diverge. |
| Judge conflates a correct disqualification with a failed conversation | Handoff anchor states a correct disqualification is 4–5; the regression test locks it. |
| Old records look inconsistent next to new ones | Acceptable for a training tool with no durable historical corpus; share page renders both; `RUBRIC_VERSION` records which rubric produced a score. |
| Heuristic Qualification/Handoff are weak (no keyword signal) | By design — fallback exists to never leave a session unscored, flagged as `heuristic`; precision is the judge's job, and the provider is normally up. |
