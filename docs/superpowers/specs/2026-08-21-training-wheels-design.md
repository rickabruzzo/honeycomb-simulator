# Training Wheels — Progressive Reveal (design)

**Date:** 2026-08-21
**Status:** Draft for review (no code yet)
**One-liner:** An opt-in guided practice mode where the attendee's hidden attributes reveal to the
trainee *as they earn them* through good discovery — a scaffold for trainees who need to see what
they're working toward. Sessions run this way are marked "assisted" wherever scores appear.

---

## 1. Why

Today the trainee never sees the attendee's hidden profile — discovering it *is* the exercise.
That's right for assessment, but brutal for a struggling trainee who doesn't yet know what "good
discovery" even looks like. Training wheels gives them a visible, positive signal — "you just
uncovered their real pain" — without turning it into the answer key up front. It's a teaching
mode, deliberately separated from unassisted scoring so the two aren't confused.

## 2. Reuse what already exists (don't invent a new signal)

The engine already makes the attendee open up as the trainee earns trust — the momentum band
(GUARDED → CURIOUS → ENGAGED → COMMITTED) already gates how much the attendee discloses (the "C"
work in `revealBudget.ts`). Training wheels **surfaces to the trainee the attributes they've
already earned** against that same signal. No new trust model — one source of truth, so the
on-screen reveal always matches how the attendee is actually behaving.

The persona already carries structured attributes to reveal: role (`personaType`), pains
(`painAnchors`, primary/secondary), mood (`emotionalPosture`), tooling lean (`toolingBias`),
buyer-or-not (`isBuyer`), OTel familiarity.

## 3. How it works

### 3.1 Turning it on
A **"Training wheels" toggle** in the Scenario Builder, next to persona/trainee. **Off by
default.** Stored on the invite/session as `trainingWheels: boolean` and carried through to the
score.

### 3.2 The reveal ladder (what appears, and when)
Two candidate triggers — **this is the main decision (§6, Decision A):**

- **Option A — earned-tier ladder (recommended).** Attributes unlock in tiers tied to the
  momentum band + discovery progress:
  - Start: nothing (neutral "Attendee" + avatar).
  - Rapport earned (→ CURIOUS): **role** appears.
  - A primary pain probed (→ ENGAGED): that **pain** appears.
  - Deep trust (→ COMMITTED): **mood, tooling lean, buyer/OTel** appear.
  Pro: mirrors the attendee's real openness exactly; teaches the arc.

- **Option B — reveal-on-surface.** Each attribute appears the moment the conversation actually
  surfaces it (attendee states a pain → that pain card lights up). Pro: tighter cause-and-effect,
  very reinforcing. Con: less tied to the trust arc; needs per-attribute detection.

Either way the reveal is **earned, never up-front** — that's the line that keeps it a teaching aid
and not the answer key.

### 3.3 Where it shows (trainee UI)
A calm side panel / strip in the session titled like **"What you've uncovered"**, populated
progressively, framed as positive reinforcement ("✓ Their top frustration: alert fatigue"). Only
rendered when `trainingWheels` is on. When off, the session is exactly as it is today (nothing
revealed). This side-steps the mockup's persona/momentum header, which leaked the profile in
normal mode.

### 3.4 Marking it "assisted" (fairness)
`trainingWheels` rides onto the `ScoreRecord`. Then:
- **Scorecard:** an "Assisted · training wheels" badge near the grade, so the context is explicit.
- **Leaderboard:** assisted entries carry an "assisted" chip; add a filter to show/hide them.
  Decision on ranking treatment in §6 (Decision B).
- **Score value:** computed the same; training wheels labels the run, it doesn't inflate the
  number (Decision C).

## 4. Scope of change
- Invite/session model: add `trainingWheels` flag (Builder → invite → session → score).
- Builder: the toggle.
- Trainee session API + session UI: the progressive "what you've uncovered" panel (gated on the flag).
- ScoreRecord + scorecard: carry + show the assisted badge.
- Leaderboard: assisted chip + filter.
Contained, and it leans on the existing momentum signal rather than new logic.

## 5. Non-goals
- No change to how unassisted sessions work or score.
- Not a hint/coach that tells the trainee what to *say* — it only reflects what they've *uncovered*.

## 6. Decisions for you (multiple-choice when you're back)
- **A. Reveal trigger:** earned-tier ladder (recommended) vs reveal-on-surface.
- **B. Leaderboard treatment of assisted:** chip + filter on the same board (recommended) /
  separate board / excluded from ranking.
- **C. Score value when assisted:** label only (recommended) / label + visible caveat /
  separate scoring track.

## 7. Risks
| Risk | Mitigation |
|---|---|
| Reveal turns into the answer key | Strictly earned (band/discovery-gated); never shown up front. |
| Assisted scores muddy the leaderboard | Explicit chip + filter; ranking treatment per Decision B. |
| Extra UI clutters the calm chat | Collapsible panel, only present when the mode is on. |
