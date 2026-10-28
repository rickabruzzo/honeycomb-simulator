# Quiz Partial Credit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give half a point for the "next best" answer on study-guide quiz questions that have one, with an amber "okay, not the best move" verdict, so the score reflects acceptable-but-not-ideal booth moves.

**Architecture:** A choice may carry `partial: true` (at most one per question, authored in the gitignored bank and validated by the seed script). The server records `partial` on the attempt item next to `correct`; scoring counts `right + 0.5 × partial` into the percent, and grades/pass stay percent-based so thresholds don't change. The client gets a third verdict state and the grade card shows right · partial · points.

**Tech Stack:** TypeScript, vitest (`lib/quiz/*.test.ts`), Next.js route handlers, React client components.

**Spec:** Proposed in chat 2026-10-27 and accepted by the user ("start on partial credit"): one partial distractor per question where a runner-up is genuinely acceptable; its existing `why_not` is the "okay, but…" text; half a point on first try; `percent = (right + 0.5·partial)/total`; C threshold unchanged (9 right + 2 partial = 10/15 passes); amber verdict "Okay, not the best move"; grade card "9 right · 2 partial · 10/15"; Quiz Results keeps percent; no gate bump.

## Global Constraints

- Quiz content stays in gitignored `content/` and KV; nothing from it is committed.
- Score stays "first try counts": re-answers return the original verdict.
- Existing attempts/records without `partial` keep working (treat missing as 0).
- `gate_version` stays 1 (more lenient, nobody has to re-pass).

## Review Focus

1. A stored record from before this change (no `partial` on items/summaries): Quiz Results and the grade card must render with partial = 0, not NaN. → Task 1 test (items without `partial`), Task 4 renders `?? 0`.
2. A partial pick that is also the last question: the result must include the half point. → Task 1 test.
3. Marking two partials on one question by mistake: the seed script must refuse. → Task 3.
4. The "missed" list: a partial pick is not a miss; it's listed separately so the trainee sees what was "okay". → Task 1 test (`missed` excludes partials, `okay` lists them).
5. Keyboard flow unchanged: Enter still advances after an amber verdict. → Task 4 manual check.

---

### Task 1: Scoring logic

**Files:**
- Modify: `lib/quiz/types.ts` (`QuizChoice.partial?: boolean`, `AttemptItem.partial?: boolean`, `QuizResult.partial: number; points: number; okay: Array<{moduleTitle; summary}>`, `AttemptSummary.partial?: number`)
- Modify: `lib/quiz/logic.ts` (`partialPos(q, item): number` (−1 when none), `computeResult` counts partials)
- Test: `lib/quiz/logic.test.ts`

- [ ] Tests: `partialPos` maps display order; `computeResult` with 9 right + 2 partial + 4 wrong → `{right: 9, partial: 2, points: 10, percent: 66.7, grade: "C", passed: true}`, `missed` has 4, `okay` has 2; items without `partial` → `partial: 0`.
- [ ] RED → implement → GREEN. Commit `feat(quiz): half credit for a partial answer in scoring`.

### Task 2: Recording a partial answer

**Files:**
- Modify: `lib/quiz/store.ts` (`answerQuestion` sets `item.partial`, outcome gains `partial: boolean`; `recordCompletion` summary gains `partial`)
- Modify: `app/api/quiz/[token]/answer/route.ts` (passes `partial` through — check it forwards the outcome object as-is)
- Test: `lib/quiz/store.test.ts` (new; memory mode) — start an attempt on a 1-question bank with a partial choice, answer with the partial pos → `{correct: false, partial: true, whyNot: <its why_not>}`, result `points 0.5`; re-answer returns the same verdict.

- [ ] RED → implement → GREEN. Commit `feat(quiz): record partial answers`.

### Task 3: Bank validation

**Files:**
- Modify: `scripts/seed-quiz.ts` `validate()`: `> 1` partial per question → problem; a partial choice that is also correct → problem; a partial choice without `why_not` → problem.
- Modify: `lib/quiz/disk.ts` only if choices are re-mapped (today they pass through).

- [ ] `npx tsx scripts/seed-quiz.ts --dry-run` passes on the current bank. Commit `chore(quiz): validate partial-credit choices`.

### Task 4: Client

**Files:**
- Modify: `components/quiz/QuizFlow.tsx`: `Verdict.partial`, choice tones (picked partial = amber `#ffb000`, correct still green), verdict box amber with heading "Okay, not the best move" + `whyNot` + "Why X is better" + `whyBest`; footer counter "N right · M partial"; `ResultCard` shows `{points}/{total}` and "9 right · 2 partial"; an "Okay, not the best" list under "What you missed" when `okay.length`.
- Modify: `app/quiz-results/page.tsx`: best/last cell shows `points/total` (format 10 or 10.5); the "Misses most" logic unchanged.

- [ ] tsc + lint; dev check with a question that has a partial choice (answer it: amber verdict; finish: points shown). Commit `feat(quiz): amber "okay, not the best move" verdict and partial points`.

### Task 5: Content and ship

- [ ] Apply the reviewed partial list to `content/study-guide/modules/*.yaml` (`partial: true` on at most one wrong choice per question; soften any `why_not` that reads as harsh for a partial). `--dry-run` clean, then `npx tsx scripts/seed-quiz.ts`.
- [ ] `npm test`, `npm run build`, push, PR, preview smoke (throwaway trainee, cleaned up), report; merge only on the user's say-so.
