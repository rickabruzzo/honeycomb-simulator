# Self-Serve Trainees Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin import trainees from a CSV and hand out ONE generic link where a person picks (or adds) themselves, passes the booth quiz, and then practices against a random persona; give trainees an email field; make quiz/practice URLs readable; make the study-guide link obviously a link.

**Architecture:** Trainee gains an optional `email`. Invite creation moves from the route into `lib/createInvite.ts` so both the Builder route and the new self-serve route share one code path (KV batch write, tracker index, background enrichment). Quiz and practice tokens become `<name-slug>-<4 random chars>`; lookups are by key so existing UUID links keep resolving. `/start` is a public page + `/api/start` route that resolves the person, ensures their quiz link, and (after a pass) ensures an unfinished random-persona practice session, remembered per trainee under `selfserve:trainee:<id>`.

**Tech Stack:** Next.js 16 App Router (client pages, route handlers), @vercel/kv with the globalThis memory store in dev, vitest, lucide-react, Tailwind.

**Spec:** Approved in chat 2026-10-27; recorded in memory `conference-simulator-work-state.md` → "BATCH 14". No committed spec (the repo is public; the design is product-internal but not secret, so this plan is the committed record).

## Global Constraints

- Repo is PUBLIC: no quiz content, FAQ text, Notion links or portraits in committed files.
- Preview deploys write to the PRODUCTION KV. Test on preview/prod only with throwaway trainees and delete them (invite, quiz link, trainee) afterwards.
- No login exists anywhere. A `/q/<name>-xxxx` link is still guessable-ish only via the suffix; say so to the user, don't block.
- Email is stored lowercase/trimmed, shown to admins only (Builder, Quiz Results), never on the public `/start` picker or any trainee-facing page. Nothing is sent to it yet.
- Pass gate unchanged: C (≥65%, 10/15). Scoring rubric untouched.
- Self-serve practice sessions: random canonical persona, training wheels OFF, `createdBy: "self-serve"`, appear in Tracker/Leaderboard like any invite.
- Admin actions stay unauthenticated, matching the rest of the app.

## Review Focus

1. A CSV exported from Excel/Google Sheets: CRLF line endings, a BOM, quoted fields with commas ("Abruzzo, Jr."), a header row. Expect: parsed cleanly, header skipped, names kept intact. → Task 3 tests.
2. Someone on `/start` types a name that already exists with different casing/spacing ("rick  ABRUZZO"). Expect: pointed at the existing entry, no duplicate trainee. → Task 6 tests (store-level `findTraineeByName`).
3. Two trainees with the same name (`rick-abruzzo-x7k2` vs `rick-abruzzo-9pq1`) or a suffix collision on create. Expect: distinct tokens; create retries on collision. → Task 2 tests.
4. A returning `/start` visitor whose last session was scored. Expect: a NEW random-persona session, not the finished one; an unfinished one is resumed. → Task 7 test on `pickSelfServeNext`.
5. An existing UUID quiz/practice link after deploy. Expect: still opens (lookups are by key; token format never validated). → Task 2 keeps lookups unchanged; verified manually in Task 10.

---

### Task 1: Trainee email in the store and the admin API

**Files:**
- Modify: `lib/traineeStore.ts`
- Modify: `app/api/trainees/route.ts`
- Test: `lib/traineeStore.test.ts` (new; `lib/*.test.ts` is already in vitest include)

**Interfaces:**
- Produces: `Trainee.email?: string`; `normalizeEmail(raw: string): string | null` (trim+lowercase, null when it fails `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`); `findTraineeByName(firstName, lastName): Promise<Trainee | null>` (active only, uses existing `normalizedName`); `findTraineeByEmail(email): Promise<Trainee | null>`; `upsertTrainee` accepts `email` and KEEPS the stored email when the caller passes none.

- [ ] **Step 1: Write failing tests** in `lib/traineeStore.test.ts` (memory mode: no KV env in vitest):
  - `upsertTrainee({firstName:"Quiz",lastName:"Tester",email:" Quiz.Tester@Example.com "})` → `email === "quiz.tester@example.com"`.
  - upsert same name with no email → email preserved.
  - `findTraineeByName("quiz  TESTER","")`-style spacing/case → finds it; `findTraineeByEmail("QUIZ.TESTER@example.com")` → finds it.
  - `normalizeEmail("nope")` → null.
- [ ] **Step 2: Run** `npx vitest run lib/traineeStore.test.ts` → FAIL (exports missing).
- [ ] **Step 3: Implement** in `lib/traineeStore.ts`: add `email?: string` to `Trainee`; `normalizeEmail`; in `upsertTrainee` set `email: trainee.email !== undefined ? normalizeEmail(trainee.email) ?? undefined : existing?.email`; export `findTraineeByName`/`findTraineeByEmail` over `listTrainees(false)`.
- [ ] **Step 4:** `app/api/trainees/route.ts` POST: accept optional `email`; when present and `normalizeEmail` returns null → 400 `{ error: "That email address doesn't look right" }`.
- [ ] **Step 5: Run tests** → PASS. **Commit:** `feat(trainees): optional email on trainees`.

### Task 2: Readable tokens for quiz links and invites

**Files:**
- Create: `lib/readableToken.ts`, `lib/readableToken.test.ts`
- Modify: `lib/quiz/store.ts` (`getOrCreateQuizLink`), `lib/createInvite.ts` (Task 4 uses it)

**Interfaces:**
- Produces: `readableToken(fullName: string, suffixLen = 4): string` → `${slugifyName(fullName) || "trainee"}-${suffix}`, suffix from `crypto.randomBytes`, alphabet `abcdefghjkmnpqrstuvwxyz23456789` (no 0/o/1/l/i); `uniqueToken(fullName, exists: (t: string) => Promise<boolean>): Promise<string>` → retries up to 5 times with 4 chars, then falls back to 8 chars.

- [ ] **Step 1: Tests:** shape `/^[a-z0-9-]+-[a-z0-9]{4}$/`, `readableToken("Rick Abruzzo")` starts with `rick-abruzzo-`, 200 draws all distinct, `uniqueToken` retries when `exists` returns true for the first call, empty name → `trainee-xxxx`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5:** `getOrCreateQuizLink`: `token: await uniqueToken(name, async (t) => Boolean(await getQuizLink(t)))`. Lookups unchanged, so existing UUID links still resolve.
- [ ] **Step 6:** `npx vitest run lib/quiz lib/readableToken.test.ts` → PASS. **Commit:** `feat(links): readable name-based tokens`.

### Task 3: CSV parsing and import planning (pure)

**Files:**
- Create: `lib/traineeCsv.ts`, `lib/traineeCsv.test.ts`

**Interfaces:**
- Produces: `parseTraineeCsv(text: string): CsvRow[]` where `CsvRow = { line: number; firstName: string; lastName: string; email: string | null; raw: string }`; `planTraineeImport(rows: CsvRow[], existing: Pick<Trainee,"id"|"firstName"|"lastName"|"email">[]): ImportPlan` with `ImportPlan = { create: Array<{firstName,lastName,email}>; update: Array<{id, firstName, lastName, email}>; skip: Array<{line, raw, reason}> }`.
- Rules: strip BOM; split on `\r?\n`; RFC-4180 quotes (`""` escape); header row skipped when its cells match `/^(first|last|email|name|e-?mail)/i`; 3 cells → first,last,email; 2 cells → first,last (email null) unless cell 2 contains `@` and cell 1 contains a space (then split name on last space); 1 cell with a space → split on last space. Skip reasons (exact copy): `"missing last name"`, `"invalid email"`, `"duplicate row"`, `"already in the system, no changes"`. Match existing by name (normalized) → update only when the row has an email that differs; otherwise skip "already…". Email duplicated across different names → the later row skips `"duplicate row"`.

- [ ] **Step 1: Tests** covering each rule above plus CRLF+BOM+quoted comma.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS. **Commit:** `feat(trainees): CSV parsing and import planning`.

### Task 4: Shared invite creation

**Files:**
- Create: `lib/createInvite.ts`
- Modify: `app/api/invite/create/route.ts` (becomes validation + call)

**Interfaces:**
- Produces: `createInvite(input: { personaId: string; traineeId: string; traineeName?: string; trainingWheels?: boolean; createdBy?: string; attendeeProfile?: string }): Promise<{ ok: true; token: string; sessionId: string; url: string; enrichment: { provider: string; status: "pending"|"cached" } } | { ok: false; status: 400; error: string }>`. Body is the current route logic moved verbatim (spans included), with `token = await uniqueToken(traineeName, async (t) => Boolean(await getInvite(t)))` replacing `randomUUID()`.

- [ ] **Step 1:** Move the logic; route keeps its body validation and maps `ok:false` → 400.
- [ ] **Step 2:** `npx tsc --noEmit` clean; dev smoke: Builder create link still returns `/s/<slug>-xxxx`. **Commit:** `refactor(invites): share invite creation with the self-serve flow`.

### Task 5: CSV import API + Builder UI (email field + upload)

**Files:**
- Create: `app/api/trainees/import/route.ts`
- Modify: `app/page.tsx` (Add-a-new-trainee row gets an optional Email input; new "Import a CSV" block; selected trainee shows email)

**Interfaces:**
- `POST /api/trainees/import` body `{ csv: string; commit?: boolean }` → `{ plan: ImportPlan, applied?: { created: number; updated: number } }`. Uses `parseTraineeCsv` + `planTraineeImport(rows, await listTrainees(false))`; when `commit`, `upsertTrainee` each create/update then `invalidateBootstrapCache()`. 400 when `csv` missing or > 200 KB; preview is read-only.

- [ ] **Step 1:** Route. **Step 2:** Builder: email input (placeholder "Email (optional)") posted with first/last; CSV block: `<input type="file" accept=".csv,text/csv">`, read with `file.text()`, POST preview, render "N new · N updated · N skipped" with an expandable skipped list showing `line · raw · reason`, "Import" button → commit → merge created/updated into `trainees` state, reset. Helper copy: `Columns: first, last, email. A header row is fine. Matching names get their email filled in.`
- [ ] **Step 3:** tsc + lint clean; dev check: upload a 3-row CSV, see the preview counts, import, see them in the select. **Commit:** `feat(builder): trainee email + CSV import`.

### Task 6: Public self-serve API

**Files:**
- Create: `lib/selfServe.ts`, `lib/selfServe.test.ts`, `app/api/start/route.ts`, `app/api/start/trainees/route.ts`

**Interfaces:**
- `GET /api/start/trainees` → `{ trainees: Array<{ id; firstName; lastName }> }` (NO email), sorted by last name.
- `POST /api/start` body `{ traineeId } | { firstName; lastName; email }` → `{ next: string; traineeName: string; passed: boolean }` or `{ error, code: "exists", trainee: { id; firstName; lastName } }` (409) when adding a name/email that already exists, or 400 for a missing/invalid field (email required here).
- `lib/selfServe.ts`: `pickSelfServeNext(args: { trainee: Trainee; passed: boolean; existing: { token: string; status: "NOT_STARTED"|"IN_PROGRESS"|"COMPLETED" } | null; quizToken: string; createInvite: () => Promise<string /*token*/> }): Promise<{ next: string; inviteToken: string }>` — pure decision + one effect: reuse `existing.token` unless it is null or `COMPLETED`; `next = passed ? /s/<token> : /q/<quizToken>?from=<token>`. Persist `selfserve:trainee:<id> → { token }` via `rememberSelfServeInvite(traineeId, token)` / `getSelfServeInvite(traineeId)` (KV or `getMemStore().quiz` map, keyed like KV).
- Route: resolve trainee (`getTrainee` / `findTraineeByName` + `findTraineeByEmail` → 409 with the match / `upsertTrainee`), `bank = await getQuizBank()`, `passed = !isQuizUsable(bank) || await traineePassed(id, bank)`, `link = await getOrCreateQuizLink(id)`, existing invite status via `getInvite` + `getSession` + `getScore` using `determineStatus` exported from `lib/adminInvites.ts`, persona = random from `listPersonas(false)` (500 `{ error: "No personas available" }` if empty), `createInvite({ personaId, traineeId, trainingWheels: false, createdBy: "self-serve" })`.

- [ ] **Step 1: Tests** for `pickSelfServeNext`: null existing → creates; IN_PROGRESS → reuses, no create; COMPLETED → creates; not passed → `/q/<quiz>?from=<invite>`; passed → `/s/<invite>`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement lib + routes; export `determineStatus` from `lib/adminInvites.ts`. **Step 4:** PASS + tsc. **Commit:** `feat(self-serve): /api/start resolves a person, their quiz and a random-persona session`.

### Task 7: `/start` page

**Files:**
- Create: `app/start/page.tsx`
- Modify: `components/TabsNavGate.tsx` (hide tabs on `/start`), `app/quiz-results/page.tsx` (copy generic link + email under names)

- [ ] **Step 1:** Page (client): eyebrow "Booth training", h1 "Who are you?", filter input ("Type your name…"), list of matching names as buttons (max 8 shown, "Keep typing to narrow it down" when more), link "I'm not in the list → Add yourself" revealing first/last/email (required) form; submit → POST `/api/start`; on 409 show "Looks like you're already here as <Name>" with a button that continues as that trainee; on success `window.location.assign(next)`. Note under the form: "Your email is only used by your trainer. Nothing is sent to it."
- [ ] **Step 2:** `TabsNavGate`: add `pathname === "/start"`.
- [ ] **Step 3:** Quiz Results: in the "Send a quiz link" card add a row: "Or share the generic link — anyone picks their name or adds themselves:" `<code>{siteUrl("/start")}</code>` + CopyButton; under each trainee name show `email` (from the `/api/trainees` list, muted xs) when present.
- [ ] **Step 4:** lint + tsc; dev e2e: /start → add "QA Quiztest" → quiz gate card shows → pass → lands on `/s/qa-quiztest-xxxx` with a random persona; second visit resumes; after scoring, a new session. **Commit:** `feat(self-serve): /start page and generic link`.

### Task 8: Study-guide link styling

**Files:**
- Create: `components/quiz/StudyGuideLink.tsx`
- Modify: `app/s/[token]/page.tsx` (QuizRequired), `components/quiz/QuizFlow.tsx` (intro footer + ResultCard), `components/PracticeIntro.tsx`

- [ ] **Step 1:** `StudyGuideLink({ children, className? })` → `<a href="/study?trainee=1" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#7cc6f2] underline decoration-[#7cc6f2]/50 underline-offset-4 hover:text-white hover:decoration-white">` with `BookOpen size={15}` + children + `ExternalLink size={13}`.
- [ ] **Step 2:** Replace the four plain links (copy: "Read the study guide" / "Read the study guide first" on the quiz intro / "Open the study guide" / "Revisit the study guide").
- [ ] **Step 3:** lint; visual check in dev. **Commit:** `feat(study-guide): make the study-guide link look like a link`.

### Task 9: Verification and hand-off

- [ ] `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` (stop the dev server first — shared `.next`).
- [ ] Push, open PR against main (title "Self-serve trainees: CSV import, generic /start link, email, readable links"), bind CI, wait for the preview.
- [ ] Preview e2e with throwaway "QA Quiztest": `/start` add → quiz 403 gate → pass → random persona session → Tracker row; CSV import of 3 throwaway rows; readable URLs; old UUID quiz link still opens. Then delete: `DELETE /api/invite/<token>`, `DELETE /api/quiz-links/<traineeId>`, `DELETE /api/trainees/<id>`.
- [ ] Report to the user with the preview URL; merge only on their say-so.
