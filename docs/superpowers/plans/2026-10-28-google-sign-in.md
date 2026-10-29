# Google Sign-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require a `honeycomb.io` Google sign-in for trainees and admin pages, identify trainees by email, and keep share links open.

**Architecture:** Auth.js v5 (`next-auth@5.0.0-beta.32`, JWT sessions) with the Google provider in `auth.ts`; a pure policy module (`lib/auth/policy.ts`) decides open paths, allowed domains and admins so it can be unit-tested; `proxy.ts` applies it at the edge of every request; `/start` and the personal-link APIs read the session via `auth()` and resolve the trainee by email.

**Tech Stack:** Next.js 16.1.4 App Router (`proxy.ts`), next-auth 5 beta, vitest.

**Spec:** `docs/superpowers/specs/2026-10-28-google-sign-in-design.md`

## Global Constraints

- Open list (never behind auth): `/share/*`, `/leaderboard/share`, `/insights/share`, `/api/share/*`, GET `/api/leaderboard`, GET `/api/insights`, GET `/api/personas`, GET `/api/conferences`, GET `/api/trainees` (names only), `/api/auth/*`, `/signin`, `/_next/*`, `/favicon.ico`, `/brand/*`.
- `AUTH_MODE=off` disables the gate only when `NODE_ENV=development`.
- No secrets committed; env: `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_SECRET`, `AUTH_TRUST_HOST`, optional `AUTH_ALLOWED_DOMAIN` (default `honeycomb.io`), optional `ADMIN_EMAILS`.
- Admin pages: `/`, `/admin`, `/editor`, `/leaderboard`, `/insights`, `/quiz-results`, `/review/*`; when `ADMIN_EMAILS` is unset every signed-in allowed-domain user is an admin.

## Review Focus

1. A share link opened by someone outside honeycomb.io with no cookie → page and its GET APIs load. → Task 1 tests (`isOpenPath`), Task 5 smoke.
2. A signed-in trainee opens another trainee's `/q/` or `/s/` link → 403 `wrong_person`, page explains; an admin opens it → allowed. → Task 4 tests.
3. A trainee record with no email (added by CSV without one) signs in via `/start` → matched by name? No: matched by email only; a new record would be created. Mitigation: when no email match exists but exactly one active trainee has the same normalized name as the Google name and no email, attach the email to that record instead of creating a duplicate. → Task 3 test.
4. `AUTH_MODE=off` must be ignored in production. → Task 1 test.
5. Google account on another domain → rejected with the plain message, no record created. → Task 2 (signIn callback) + Task 5 manual check.

---

### Task 1: Policy module
**Files:** Create `lib/auth/policy.ts`, `lib/auth/policy.test.ts` (add `lib/auth/*.test.ts` to vitest include).
**Produces:** `isOpenPath(pathname: string, method: string): boolean`; `isAllowedEmail(email: string | null | undefined, domain = process.env.AUTH_ALLOWED_DOMAIN ?? "honeycomb.io"): boolean`; `isAdminEmail(email, adminList = process.env.ADMIN_EMAILS): boolean` (unset list → true for any allowed email); `isAdminPath(pathname): boolean`; `authDisabled(env = process.env): boolean` (true only when `AUTH_MODE === "off"` and `NODE_ENV === "development"`).
- [ ] Tests per the Global Constraints; RED → GREEN. Commit `feat(auth): access policy`.

### Task 2: Auth.js wiring
**Files:** Create `auth.ts` (root), `app/api/auth/[...nextauth]/route.ts`, `app/signin/page.tsx`, `proxy.ts`; modify `components/TopNav.tsx` (signed-in name + sign-out on admin pages, server component reading `auth()`), `components/TabsNavGate.tsx` (hide tabs on `/signin`).
- `auth.ts`: `NextAuth({ providers: [Google], session: { strategy: "jwt" }, pages: { signIn: "/signin", error: "/signin" }, callbacks: { signIn: ({ profile }) => isAllowedEmail(profile?.email) && (profile?.hd ? profile.hd === domain : true), jwt/session: expose email + name, authorized? (not used; proxy decides) } })`. Export `{ handlers, auth, signIn, signOut }`.
- `proxy.ts`: `export default auth((req) => …)` pattern or manual `getToken`; if `authDisabled()` → next(); if `isOpenPath` → next(); no session → API: 401 JSON `{ error: "Sign in required", code: "unauthenticated" }`; page: redirect `/signin?callbackUrl=<path>`; `isAdminPath` and not admin → 403 page text. Matcher excludes `_next/static`, `_next/image`, `favicon.ico`, `brand/`.
- `/signin`: card with "Sign in with Google" (server action `signIn("google", { redirectTo })`), error copy for `AccessDenied` ("Use your Honeycomb Google account"), and a "Sign-in isn't configured yet" state when `AUTH_GOOGLE_ID` is missing.
- [ ] tsc + lint; dev: `/` redirects to `/signin` when signed out (with `AUTH_MODE` unset). Commit `feat(auth): Google sign-in with Auth.js`.

### Task 3: `/start` from the session
**Files:** Modify `app/api/start/route.ts`, `app/start/page.tsx`; create `lib/auth/traineeForUser.ts` (+ test) with `traineeForUser({ email, name, givenName, familyName }): Promise<Trainee>` — find by email; else a single active same-name trainee with no email gets the email attached; else create. `GET /api/start/trainees` is no longer needed by the page (keep the route; it's harmless, names only).
- `/api/start` POST: identity from `auth()`; body ignored except nothing; 401 when no session (proxy already blocks). Remove the pick/add branches. Keep the quiz/session logic.
- `/start` page: server component: `const session = await auth()`; show "You're *First Last* (email)" + Start button (client) + "Not you? Sign out". Start → POST `/api/start` → navigate to `next`.
- [ ] Tests: `traineeForUser` (3 cases) and the route with a mocked `auth`. Commit `feat(auth): /start identifies the trainee from the Google session`.

### Task 4: Personal links belong to their trainee
**Files:** Modify `app/api/invite/[token]/route.ts` (GET), `app/api/quiz/[token]/route.ts` (GET, POST), `app/api/quiz/for-invite/[inviteToken]/route.ts`; create `lib/auth/ownership.ts` (+ test): `checkOwnership(session, trainee): "ok" | "attach" | "wrong_person"`; pages `app/q/[token]/page.tsx`, `app/s/[token]/page.tsx` render the wrong-person card on 403 `code: "wrong_person"` with sign-out link.
- [ ] Tests for `checkOwnership` and one route. Commit `feat(auth): personal links only open for their trainee (or an admin)`.

### Task 5: Env, verification, ship
- [ ] `AUTH_SECRET` + `AUTH_TRUST_HOST` added to Vercel (Production + Preview) and `.env.local`; Rick supplies `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`.
- [ ] Automation helper `scripts/mint-session.mjs` (encode a JWT with `AUTH_SECRET` for smoke tests).
- [ ] `npm test`, `npx tsc --noEmit`, build (when the dev server isn't needed), PR, preview smoke with a minted cookie: open list without cookie → 200; `/api/trainees?include=email` without cookie → 401; `/start` with cookie → trainee resolved by email; wrong-person 403. Real Google sign-in verified on production after merge (needs the client). Merge only on Rick's say-so.
