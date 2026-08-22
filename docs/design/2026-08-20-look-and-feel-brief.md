# Design Brief — Conference Simulator Look & Feel

**For:** Claude Design (or any designer taking a first pass)
**Date:** 2026-08-20
**Deliverable:** Visual design direction + mockups for the priority screens, translatable to the
existing stack. Not a functional change.

---

## 1. What this app is

An internal training simulator for Honeycomb booth staff. A trainee (sales / SE / booth
volunteer) runs a live discovery conversation against an AI-simulated conference attendee, then
gets a graded scorecard on how well they ran it. Trainers can review the transcript. There's a
leaderboard and insights view across sessions.

It is **not customer-facing** — the audience is Honeycomb employees practicing before a
conference. But it should still feel like a real, polished Honeycomb product, not an internal
prototype. Today it reads a bit "internal tool": functional, a little rough, inconsistent
spacing and hierarchy.

**Repo is public.** No confidential content in any mockup — no customer names, logos, or quotes.
Use only the generic persona role names (SRE, DevOps Engineer, Technical Decision-Maker, Build &
Release Engineer, Developer, Platform Engineer).

---

## 2. Current visual language (what exists to build on)

- **Stack:** Next.js 16 (App Router), Tailwind CSS v4, Geist Sans/Mono, `lucide-react` icons.
- **Theme:** dark only. Deep navy background (`#070a12`) with soft radial color glows (sky,
  violet, emerald). Glassy surfaces (`rgba` slate panels, `bg-white/7`, `border-white/15`,
  `backdrop-blur`).
- **Brand palette already in code** (`BrandButton` variants): lime `#64BA00`, cobalt `#0278CD`,
  indigo `#51368D`, red `#E65B53`, plus a Honeycomb "tango" orange `#F96E10` and sky / violet /
  emerald accents. TopNav shows the Honeycomb wordmark: "Honeycomb · Conference Simulator".
- **Components:** `BrandButton` (5 variants), `ChipInput`, card pattern
  (`rounded-lg border border-white/15 bg-white/7 p-6 shadow-sm`) repeated across pages.

Keep the Honeycomb brand identity and the dark, focused feel — the goal is to *sharpen and
unify* it, not replace it. Deciding whether to introduce a light mode is open (see §5); dark-only
is acceptable if done well.

---

## 3. Priority screens

In order of impact:

1. **Scorecard** (`/share/[token]`) — the payoff moment. A grade splash (A–F + score/100), a
   per-dimension breakdown with evidence quotes, "what you did well," "areas for improvement,"
   and guardrail violations. This is the screen worth the most design attention: the grade
   reveal should feel earned and legible, and the six dimension bars + evidence should scan
   easily. **Note:** an in-flight change (scoring v3) moves this from 5 to **6 dimensions**
   (Discovery, Listening, Empathy, Qualification, Guardrails, Handoff), each 0–20, each with a
   short rationale + a verbatim trainee quote. Design the breakdown to hold six rows with
   evidence gracefully.
2. **Session / chat** (`/s/[token]`) — the core loop: the trainee's live conversation with the
   attendee. Should feel calm and focused (it's a practice conversation, not a busy dashboard),
   with a clear sense of the attendee "persona" they're talking to and an obvious way to end the
   session.
3. **Home / invite** (`/`) — first impression; create a practice session / invite a teammate.

Secondary (consistency pass, not hero treatment): **Review** (`/review/[token]`),
**Leaderboard**, **Insights**, **Editor**, **Admin**.

---

## 4. Goals

- **One cohesive system.** Unify the repeated card / button / chip patterns into a small,
  consistent kit with a clear typographic scale and spacing rhythm. Right now similar things
  look slightly different across pages.
- **Sharper hierarchy.** Each screen should have one obvious focal point (the grade on the
  scorecard, the conversation on the session page, the primary action on home).
- **Make the grade moment land.** The scorecard grade splash is the emotional peak — give it
  real design (without gaudiness), and make the dimension breakdown genuinely readable at a
  glance, evidence included.
- **Feel like Honeycomb.** Tasteful use of the brand palette and the hexagon motif; product-
  grade polish, not marketing-site maximalism.
- **Accessible and responsive.** Sufficient contrast on the dark theme, visible focus states,
  works down to a laptop and a phone.

---

## 5. Open questions for the designer to take a position on

- **Light mode?** Stay dark-only (simpler, already the vibe) or introduce a light theme? If
  light is added, it must be a real, complete palette, not an afterthought.
- **Hexagon motif** — how far to lean into it (background texture, dimension icons, grade badge
  shape) before it tips into gimmick.
- **Grade reveal** — static card vs. a light reveal animation. Keep it fast and non-annoying.

---

## 6. Constraints

- Must translate to **Tailwind v4 + the existing tokens** in `app/globals.css` (extend the token
  set rather than hard-coding hex everywhere). Icons from `lucide-react`.
- Don't break the scorecard's **dynamic breakdown rendering** (it maps over whatever dimension
  keys a record has) or the evidence blocks.
- No new heavy dependencies or external asset hosts; keep it self-contained.
- Visual/CSS/layout only — no changes to scoring logic, the attendee engine, or data shapes.

---

## 7. Deliverable

A design canvas (or mockups) covering the three priority screens — scorecard, session, home —
plus a one-screen component/token direction (buttons, cards, chips, typography scale, the
extended color tokens). Enough for a developer to implement in Tailwind without guessing. A
short rationale for the choices (especially the §5 positions) is welcome.
