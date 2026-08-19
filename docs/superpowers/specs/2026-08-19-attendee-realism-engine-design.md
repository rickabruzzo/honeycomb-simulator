# Attendee Realism Engine — Design

**Date:** 2026-08-19
**Status:** Awaiting review
**Scope:** Attendee response generation only. Scoring, scenario content, and the SME
calibration harness are separate subsystems with their own specs.

---

## 1. Why this work exists

The simulated conference attendee feels flat and repetitive, and gets measurably worse the
longer a session runs. Trainees report that it does not answer what they asked.

This document specifies the fix. It is written to be read cold, by someone with no recall of
the project, because that is the actual situation this project keeps finding itself in.

### What the simulator is for

Booth staff practice discovery conversations against a simulated conference attendee. The
skill being trained is conversational, not product recall: break the ice, learn what the
attendee actually does, earn trust, get them to describe pain in their own words, probe
impact, decide whether Honeycomb is relevant, and hand off cleanly. A correct polite
disqualification is a successful outcome.

The design principle that governs everything below: **the attendee is not trying to help the
trainee succeed.** Information is earned. Realism depends on restraint.

---

## 2. Root causes (audited against `84977bc`)

Each of these was verified by reading the code, not inferred.

### 2.1 A keyword template layer answers most turns before the LLM runs

`lib/attendee/generateAttendeeReply.ts` runs first in
`app/api/session/[id]/message/route.ts:255`. The LLM is only reached when no template
matches. `lib/attendee/intentClassifier.ts` classifies via `String.includes()` on normalized
text, which misfires constantly:

| Trainee says | Substring hit | Attendee replies |
|---|---|---|
| "That must be frustrating. What does that cost you when it happens?" | `cost` → `ASK_PRICING` (0.9) | "We're cost-conscious. How does pricing work?" |
| "How long have you been at the conference?" | `how long` → `ASK_ROLLOUT_EFFORT` (0.85) | "How much effort is the rollout? We're pretty lean on bandwidth." |
| "We can dig into that later." | `later` → `DEFERRED_INTEREST_CLOSE` (0.85) | Closes the conversation. |
| "Let me follow up on that." | `follow up` → `MQL_CLOSE` (0.9) | Asks for a badge scan. |

The first row is the worst case: the trainee showed empathy and probed business impact —
the single highest-value behavior the simulator exists to train — and got a pricing
objection.

### 2.2 The degradation-over-time mechanism

When an intent fires at ≥0.8 confidence it is appended to `session.expressedIntents`
(`route.ts:269`). On any later turn that matches the same intent, `applyIntentExhaustion`
routes to `getTransitionIntent`, which **changes the subject** — all four pain intents
transition to `ASK_NEXT_STEPS`.

Consequence: the more persistently a trainee probes pain, the harder the attendee pushes
toward wrapping up. Correct trainee behavior is punished, and the effect compounds as more
intents accumulate in `expressedIntents`. This is the reported degradation.

### 2.3 Templates are persona-blind

Only tool names are slotted (`fillTemplateSlots`). A startup CTO and an on-call developer
emit the identical string: *"We're drowning in alerts. Half of them are noise."* Persona
affects nothing else on the template path.

Worse, `getDefaultToolStack()` keys off the persona's **job title** and ignores the scenario's
explicit `Tooling bias` field. The `qcon-startup-cto` scenario — OSS-first, "we can build it"
— matches on `"cto"` and answers **"New Relic and Splunk"**, the opposite of its stated
character. Scenario config and template behavior contradict each other.

This inverts an apparent risk: deleting the template layer *improves* tooling consistency,
because the generator reads the scenario's real `Tooling bias` instead of a title-keyed default.

### 2.4 A hard length cap makes the reward mechanic impossible

`postProcessAttendeeText` truncates to 2 sentences / 220 characters and is applied to **LLM
output too** (`route.ts:360`). Empathy-triggered venting and incident war stories — the
designated reward for good listening — cannot fit in two sentences. The reward the whole
design rests on could never be delivered.

### 2.5 Prompt-patch accumulation and contradiction

`lib/llm/defaultPromptBundle.ts` is 401 lines: 183 bullet rules, 38 prohibitions, 16
`CRITICAL`/`MUST` blocks, on `gpt-4o-mini` at temperature 0.4. Rules contradict each other:

- `CONVERSATION INTEGRITY RULE`: never disengage without explicit disinterest.
  `REALISM AND AUTHENTICITY`: "Exit politely if the trainee pitches too early."
- `reveal_information_only_when_earned` (config) vs.
  `MQL CONVERGENCE PROTOCOL (MUST FOLLOW - 1 TURN CLOSE)` … "NO additional discovery questions."

### 2.6 The attendee is instructed to invert its own role

Three sections actively cause the behavior being complained about:

- `SUCCESS OPTIMIZATION (INTERNAL GUIDANCE)`: *"The goal is to help trainees achieve A or B
  grades."* The attendee is told to help the trainee win. This directly negates the project's
  central principle.
- `REALISTIC CONVERSATION ARC`: a fixed five-step question script to follow, plus
  *"After ICEBREAKER, converge quickly to Honeycomb-specific questions"* with twelve approved
  questions. This is the handoff doc's §23.1 complaint ("simulator continued along an
  internal script rather than responding") written down as an instruction.
- `ACTIVE LISTENING`: instructs the attendee to summarize pain and then *"advance the
  conversation toward Honeycomb's fit"* — the trainee's job, assigned to the attendee.

### 2.7 Two competing sources of behavioral truth

`lib/simulator.config.json` is already a well-structured behavior spec (states, advance/block
conditions, banned keywords, OTel levels, frontend rules, outcome bands, stakeholder types).
`renderSimulatorRules()` renders it into the prompt — and then the prose bundle is appended,
restating the same rules in different words and contradicting several. The model is caught
between two authorities.

---

## 3. Goals and non-goals

### Goals

1. The attendee answers what the trainee actually asked.
2. Openness rises with earned trust and falls when trust is violated — enforced in code, not
   requested in prose.
3. Venting and war stories are reachable, and only reachable when earned.
4. Persona shapes what the attendee cares about on every turn.
5. One source of behavioral truth.
6. The attendee never volunteers Honeycomb product vocabulary.
7. Why the attendee behaved a given way is inspectable.

### Non-goals (explicitly deferred)

- **Scoring and feedback.** Today's rubric is keyword counting
  (`discovery = questionCount * 2 + openEndedCount * 3`; five empathy phrases max the score).
  It is bad and it is next, but it needs realistic transcripts to grade first.
- **Scenario library expansion.** Separate spec.
- **Regression corpus and SME calibration.** Separate spec. This spec ships the unit-testable
  seam that makes it possible.
- **Any web app or auth work.** Already exists.

---

## 4. Target behavior

Stated as observable change, since that is the acceptance surface.

| Situation | Today | After |
|---|---|---|
| "What does that cost you when it happens?" | Pricing objection | Answers the impact question |
| Trainee shows empathy, lets attendee finish | Nothing changes | Replies lengthen; a war story becomes reachable |
| Trainee interrupts a vent to pitch | Nothing changes | Next reply goes clipped within one turn |
| Trainee asks "what do you work on?" | May be ignored | Always answered; role is recorded as disclosed |
| Trainee probes pain a third time | Subject changes toward closing | Deeper disclosure, if trust supports it |
| Trainee pitches in turn two | Mild prose discouragement | Guard rises; disclosure budget shrinks |
| Attendee pushback ("vs Datadog?") | Can arrive immediately, from a script | Arrives once the trainee frames a solution |
| Attendee asked something deeply technical | May bluff | Asks for an SA/DevRel |
| Conversation has no fit | Tends toward demo/MQL | Polite exit is reachable and correct |

---

## 5. Architecture

Three units, one job each. The judge **observes**, the reducer **decides**, the generator
**speaks**. No unit does two of those.

```
Trainee message
      ↓
[1] JUDGE — small model, structured output
      → TurnSignals
      ↓
[2] REDUCER — pure function, zero I/O
      reduce(state, signals, config) → AttendeeState
      ↓ derive
      RevealBudget
      ↓
[3] GENERATOR — frontier model
      persona + phase + budget + disclosed + transcript → dialogue
      ↓
persist turn + signals + state snapshot
```

### 5.1 Judge

One structured call per turn. Observation only — it emits no scores and makes no decisions.

```ts
interface TurnSignals {
  empathy_shown: boolean;
  validation_shown: boolean;
  open_question: boolean;
  closed_question: boolean;
  asked_role: boolean;
  asked_tooling: boolean;
  asked_impact: boolean;
  asked_otel: boolean;
  assumed_otel_maturity: boolean;   // asserted rather than asked
  pitched_product: boolean;
  jargon_used: string[];            // Honeycomb terms the trainee introduced
  interrupted_vent: boolean;        // prior attendee turn was a vent; this turn pivots away
  escalated_to_expert: boolean;
  reflected_prior_answer: boolean;
  topic: string;
}
```

Inputs: trainee message, previous attendee message (needed for `interrupted_vent`), phase.
**It is not given the hidden persona**, so it cannot leak it.

`jargon_used` matters because once the trainee introduces a term, the attendee is permitted
to acknowledge it — that rule already exists in config and needs this signal to work.

### 5.2 Reducer

Pure function. No I/O, no clock, no randomness beyond the existing `outcomeSeed`. All
thresholds and deltas read from `simulator.config.json`.

```ts
interface AttendeeState {
  phase: "ICEBREAKER" | "EXPLORATION" | "PAIN_DISCOVERY" | "SOLUTION_FRAMING" | "OUTCOME";
  trust: number;        // 0..1
  guard: number;        // 0..1
  engagement: number;   // 0..1
  disclosed: {
    role: boolean;
    tooling: boolean;
    otel: boolean;
    pains: string[];        // which latent pains have surfaced
    ventedTopics: string[];
    warStoryTold: boolean;
  };
  otelCorrectionPending: boolean;
  ventInProgress: boolean;
  seed: string;
}
```

Representative rules (exact deltas land in config, tuned during implementation):

| Signal | Effect |
|---|---|
| `empathy_shown` or `validation_shown`, phase ≥ PAIN_DISCOVERY | `trust ↑`, `guard ↓` |
| `open_question` | `engagement ↑` |
| `reflected_prior_answer` | `trust ↑` (smaller) |
| `pitched_product`, phase ≤ EXPLORATION | `guard ↑↑`, `trust ↓` |
| `interrupted_vent` | `engagement ↓↓`, `guard ↑`, `ventInProgress = false` |
| `asked_role` | `disclosed.role = true`, **unconditional** |
| `asked_tooling` | `disclosed.tooling = true` |
| `assumed_otel_maturity` | `otelCorrectionPending = true`, `trust ↓` |
| `escalated_to_expert` | `trust ↑` |
| `asked_impact` | `engagement ↑`, unlocks impact-tier disclosure |

**`asked_role` is unconditional by design.** Handoff doc §23.1 records that failing to answer
role questions was the single most damaging defect. Making it a hard state write means no
prompt-compliance failure can reintroduce it.

Phase advancement moves into the reducer, absorbing the gating added in `1163f30`
(`shouldEnterOutcomeState`, `isEvaluationQuestion`, commitment detection in
`lib/outcomeCommitment.ts`). Those were real fixes and are preserved as code.

Exit rules, resolving §2.5's contradiction: **early pitching raises guard, it does not exit.**
Exit only on explicit disengagement or an accepted outcome.

### 5.3 Reveal budget

Derived from state, never stored. This is the mechanism that makes empathy pay.

```ts
interface RevealBudget {
  maxNewFacts: 0 | 1 | 2;
  ventAllowed: boolean;
  ventDepth: "none" | "brief" | "war_story";
  lengthBudget: { minSentences: number; maxSentences: number };
  pushbackAllowed: boolean;      // may the attendee ask its own question this turn
  mustCorrectOtel: boolean;
}
```

The generator receives this as **natural-language directives, never numbers** — numeric state
in a prompt tends to leak into prose, which is handoff doc §23.5's leakage bug.

`ventDepth: "war_story"` requires `trust` above a config threshold **and**
`disclosed.pains.length > 0` **and** `warStoryTold === false`. That is
"venting is a reward, not a giveaway" expressed as a precondition instead of a request.

`pushbackAllowed` is false before SOLUTION_FRAMING except for the one capability-scoping
question permitted at the PAIN_DISCOVERY → SOLUTION_FRAMING boundary. This is the decision
that the trainee drives discovery and the attendee pushes back late.

### 5.4 Generator

Receives persona (private), phase, budget as directives, `disclosed`, and transcript.
Produces dialogue only.

Being told what is already disclosed keeps it self-consistent — handoff doc §7's
"persona feels disconnected" complaint.

### 5.5 Determinism

`outcomeSeed` is retained. Judge and reducer are deterministic given identical signals; only
the generator's wording varies. Mechanics stay reproducible for testing; only phrasing is
free — which is the correct split for a human-feeling attendee.

---

## 6. Prompt architecture

**`lib/simulator.config.json` becomes the single source of truth for behavior.** The prose
bundle shrinks to role, voice, and character — target under 80 lines. Duplication between the
two is removed.

### 6.1 Rule triage

Every section of the current 401-line bundle is dispositioned. Nothing is dropped silently;
`DELETE` rows are deletions on the record, with a reason.

| # | Section | Disposition | Reason |
|---|---|---|---|
| 1 | CRITICAL ROLEPLAY RULES | **Keep** → voice layer | Core role framing |
| 2 | ROLE CORRECTNESS GUARDRAILS | **Keep** → config `role_boundaries` | Real fix: attendees don't scan badges |
| 3 | CONVERSATION INTEGRITY RULE | **Move** → reducer exit rules | Enforce in code, not prose |
| 4 | RESPONSE STYLE | **Split** | Voice kept; "1–2 sentences maximum" **deleted** (§2.4); markdown/bullet/parenthetical bans move to `postProcess` sanitizer |
| 5 | INFORMATION DISCLOSURE | **Move** → reveal budget | Mechanize |
| 6 | SMALL-TALK ENTRY GUARD | **Keep** → config `first_turn_forbidden_assumptions` | Real fix: don't assume microservices on turn one |
| 7 | DISCOVERY QUESTION STYLE | **Delete**; intent → voice | Instructs attendee to run discovery. Anti-abstract intent preserved as voice rule |
| 8 | TOOL SPECIFICITY (TIMING) | **Keep** → config | Real attendees name their tools; asking about tools *is* earning it |
| 9 | ACTIVE LISTENING | **Delete** | Tells attendee to "advance the conversation toward Honeycomb's fit" — trainee's job (§2.6) |
| 10 | PERSONA-AWARE EMPATHY | **Keep** → persona layer | Genuinely good IC vs. exec differentiation |
| 11 | QUESTION BALANCE RULE | **Delete** | "If engaged, STOP asking discovery, shift to evaluation mode" drives the inversion |
| 12 | POST-PAIN VALUE BEAT | **Rescope** → `pushbackAllowed` at phase boundary | Good instinct, wrong mechanism |
| 13 | CAPABILITY FRAMING | **Rescope** → config | Constrains how attendee *reacts to* capability claims, not how it pitches them |
| 14 | PRODUCT KEYWORD DISCIPLINE | **Keep** → already config `keyword_restrictions`; drop prose | Duplication |
| 15 | STATE AWARENESS | **Keep** (thin) | Phase arrives via runtime context |
| 16 | REALISM AND AUTHENTICITY | **Keep**, minus exit clause | "Exit if pitched early" contradicts #3; resolved as guard↑ |
| 17 | HONEYCOMB-SPECIFIC QUESTIONS ONLY / DISALLOWED QUESTIONS | **Rescope** | Keep anti-meta-question rule as voice. Delete "converge quickly" + the 12-question list (scripting) |
| 18 | ROLE-AWARE QUESTIONING | **Rescope** → persona layer | Becomes what the persona *cares about*, not a question script |
| 19 | REALISTIC CONVERSATION ARC | **Delete** | Fixed 5-step script; the literal cause of §23.1 |
| 20 | SUCCESSFUL BOOTH OUTCOMES | **Split** | Keep "not all end in demo / self-service is success". Delete "prioritize convergence over completeness" |
| 21 | SELF-SERVICE INDICATORS | **Keep** → already config `self_service_cues`; drop prose | Duplication |
| 22 | MQL SUCCESS CRITERIA | **Keep** → already config `mql_cues`; drop prose | Duplication |
| 23 | MQL CONVERGENCE PROTOCOL (1-TURN CLOSE) | **Delete** | Contradicts earn-it; commitment detection already handles this in code |
| 24 | OUTCOME DETECTION GUARDRAIL | **Move** → code | Already in `outcomeCommitment.ts` / `outcomeEvaluation.ts` |
| 25 | STAKEHOLDER-AWARE ENGAGEMENT | **Keep** → already config `stakeholder_types`; soften | "Execs rarely want demos / MQL preferred" pre-decides outcomes; becomes a prior, not a rule |
| 26 | STATE-SPECIFIC BEHAVIOR EXPECTATIONS | **Keep** → already config `states[].attendee_behavior`; drop prose | Duplication |
| 27 | SUCCESS OPTIMIZATION (INTERNAL GUIDANCE) | **Delete entirely** | "The goal is to help trainees achieve A or B grades" negates the project's central principle |
| 28 | FACILITATOR_SETUP_V1 | **Keep**, trimmed | Scene framing |
| 29 | POST_SESSION_RUBRIC_V1 | **Leave untouched** | Unused; belongs to the scoring subsystem |

Net: 7 deletions, 5 rescopes, 6 duplications removed, remainder re-homed.

### 6.2 Response length policy

The fixed cap is replaced by `lengthBudget` from state:

| Condition | Sentences |
|---|---|
| ICEBREAKER, high guard | 1–2 |
| EXPLORATION | 2–3 |
| PAIN_DISCOVERY, trust below vent threshold | 2–3 |
| PAIN_DISCOVERY, `ventDepth: brief` | 3–4 |
| `ventDepth: war_story` | 5–7 |
| Turn after `interrupted_vent` | 1 |

The trainee can feel their listening working in the shape of the replies. That puts a training
signal in the dialogue itself, not only in the post-session scorecard.

`postProcess` is refactored: it keeps the sanitizers (strip markdown, bullets, stage
directions, trailing "what about you?") and **loses the style truncator**. A generous absolute
ceiling (~1200 chars) remains only as a runaway guard.

Parenthetical stripping is kept deliberately, even though the handoff doc mentions figurative
eye-rolling: the risk of `(moves into PAIN DISCOVERY)` leaking to a trainee outweighs it. The
generator is instructed to convey posture in words instead.

### 6.3 Model routing

Route through Vercel AI Gateway with two named roles:

| Role | Tier | Default | Rationale |
|---|---|---|---|
| `attendee` | Frontier | `anthropic/claude-sonnet-5` | Persona restraint, emotional posture, escalating candor |
| `judge` | Small/fast | `anthropic/claude-haiku-4-5` | Bounded classification into a fixed schema |

Defaults are a starting point to be compared, not a conclusion — the point of routing through
the Gateway is that swapping either is an env change.

Both configurable by env so a model swap is config, not code — which is what lets us A/B two
models against one scenario during SME calibration. At ~20 turns per session, cost is cents
per session; it is not a design constraint at this scale.

`MockChatProvider` is retained for offline development and tests.

---

## 7. Error handling

| Failure | Behavior |
|---|---|
| Judge call fails | Degrade to neutral signals (no state change), log, continue. Never fails a session. |
| Judge returns invalid schema | One retry, then neutral signals. |
| Generator fails | One retry → `MockChatProvider` → canned line. (Existing ladder, preserved.) |
| Config threshold missing | Fail fast at startup, not mid-session. |

A trainee never sees a raw error. A degraded turn is logged and visible in debug mode.

---

## 8. Observability and debug mode

Per-turn span attributes to Honeycomb: every emitted signal, `trust`/`guard`/`engagement`
values and deltas, the derived budget, whether a vent was permitted and whether one fired,
phase transitions with reason, and which model served the turn.

This makes attendee realism queryable: *which trainee behaviors actually move an attendee's
openness, across all sessions?* Fitting, given the product, and the practical way to tune
thresholds rather than guess at them.

Debug mode (handoff doc §25 step 3) becomes near-free: render the signal set, state snapshot,
and budget per turn. Admin-gated. Trainee mode shows dialogue only.

---

## 9. Testing

The reducer is a pure function, so the core mechanic is testable with no API key:

- Empathy in PAIN_DISCOVERY raises trust and lowers guard.
- `interrupted_vent` drops engagement and clips the next `lengthBudget` to 1.
- Early pitch raises guard and shrinks `maxNewFacts`.
- `asked_role` sets `disclosed.role` from **every** phase and every guard level.
- `war_story` is unreachable below the trust threshold and unrepeatable once told.
- Exit is unreachable without explicit disengagement or an accepted outcome.

Judge: fixture trainee messages → expected signal sets, as snapshot tests.

Generator: assert output contains no banned keyword from `keyword_restrictions`, and no
markdown or stage directions.

**The repo has no test runner today** (`playwright` is present but unused; `test:detection` is
a bare node script). Phase 2 adds Vitest. Existing `scripts/*.js` checks stay as-is.

---

## 10. Phasing

### Phase 1 — remove what is fighting the design

1. Delete the template path: remove `generateAttendeeReply`, `intentClassifier`, `templates`,
   `variantPicker`. LLM serves every turn.
2. Retire `session.expressedIntents` and `session.toolingContext` (template-only fields).
   Verified safe: `AttendeeIntent` and `intentTypes` are referenced only inside
   `lib/attendee/`, and `expressedIntents` only in the route block being removed. Tooling
   consistency is anchored by the scenario's `Tooling bias` plus the transcript — strictly
   better than the title-keyed defaults it replaces (§2.3).
3. Refactor `postProcess`: keep sanitizers, drop the style truncator.
4. Apply a static phase-based `lengthBudget` as an interim step.
5. Execute the §6.1 triage; rewrite the bundle thin; remove config/prose duplication.
6. Route via AI Gateway; `attendee` on a frontier model.

**Acceptance:** a live session, same scenario, before and after. The attendee answers impact
questions, does not deflect to pricing on the word "cost," and does not railroad toward
closing when probed repeatedly.

### Phase 2 — make the mechanic real

1. Judge with `TurnSignals` schema.
2. Reducer with `AttendeeState`, absorbing `advanceState` / outcome gating.
3. `RevealBudget` derivation; generator consumes directives.
4. Vitest + the §9 reducer and judge tests.
5. OTel turn attributes; admin debug view.

**Acceptance:** the §9 tests pass, and debug mode shows trust rising on an empathetic turn and
guard rising on an early pitch, within one live session.

---

## 11. Files touched

**Deleted:** `lib/attendee/templates.ts`, `intentClassifier.ts`, `intentClassifier.ts.bak`,
`intentTypes.ts`, `variantPicker.ts`, `generateAttendeeReply.ts`

**Added:** `lib/attendee/judge.ts` (judge call + schema), `lib/attendee/state.ts`
(`AttendeeState` and `TurnSignals` types), `lib/attendee/reducer.ts` (pure reducer),
`lib/attendee/revealBudget.ts` (derivation + directive rendering), `lib/llm/gateway.ts`
(AI Gateway model routing), `lib/attendee/*.test.ts`, `vitest.config.ts`

Types live in `state.ts`; `storage.ts` only persists the snapshot on the session record.

**Modified:** `app/api/session/[id]/message/route.ts` (turn pipeline),
`lib/attendee/postProcess.ts`, `lib/llm/defaultPromptBundle.ts` (thin rewrite),
`lib/simulator.config.json` (thresholds, re-homed rules), `lib/simulator.ts` (phase logic to
reducer), `lib/storage.ts` (state shape), `lib/llm/promptComposer.ts`,
`lib/llm/chatProvider.ts`

**Untouched:** scoring, all admin/editor/insights/leaderboard/invite surfaces, auth, KV
storage layer.

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| Deleting templates removes a behavior that was quietly load-bearing | Phase 1 ships alone and is judged in a live session before Phase 2 |
| Two calls per turn adds latency | Judge is small/fast and runs on a bounded schema; measure in Phase 2 and consider parallelizing against generation if needed |
| Thresholds are guesses at first | Instrumented from day one; tuned against real sessions in Honeycomb rather than by intuition |
| Frontier model is more verbose | `lengthBudget` is an explicit instruction and the runaway ceiling remains |
| Prose rewrite loses a hard-won fix | §6.1 triage is exhaustive and on the record; deletions are justified individually |

---

## 13. Deferred, with intent

- **Scoring rework** — the next spec. Anchored 0–5 rubric, LLM judge citing trainee evidence,
  demo handoff summary. Blocked on this spec producing transcripts worth grading.
- **Scenario library** — bad-fit, happy incumbent, student, existing customer,
  security blocker, rushed attendee.
- **Regression corpus + SME calibration** — needs §9's seam, then fixed transcripts and blind
  SME scoring before any score is treated as authoritative.
- **Honeycomb website keyword refresh** — handoff doc §32 notes this was never done; the
  banned-keyword list may be stale. Flag discrepancies for SME review rather than silently
  adopting website language.
