# Google Sign-In for the Conference Simulator — Design

Date: 2026-10-28. Decided with Rick in chat (scope and identity choices are his; library and
mechanics are the builder's calls, marked below).

## Intent

Honeycomb's email is Google Workspace, so a Google sign-in restricted to `honeycomb.io`
accounts replaces the planned "verification code sent to inbox" idea. It closes two gaps at
once: anyone with the `/start` link can no longer pick a colleague's name and take their quiz,
and the admin pages stop being open to anyone who guesses the URL.

## Goals

- Trainees sign in with their Honeycomb Google account before the quiz or a practice session.
- A signed-in person is identified by their **email**: it finds their trainee record, or a
  record is created from their Google name. No name picking, no duplicates. (Rick's choice.)
- Admin pages and admin APIs require a signed-in `honeycomb.io` account. (Rick's choice.)
- **Share links stay open**: scorecards (`/share/<token>`), the shared leaderboard
  (`/leaderboard/share`) and shared insights (`/insights/share`), plus the GET APIs those pages
  read. (Rick's choice.)
- Personal links (`/q/<token>`, `/s/<token>`) only work for the trainee they belong to (or an
  admin). A legacy trainee record with no email gets the signed-in email attached on first use.

## Non-goals

- No passwords, no magic links, no accounts outside Google Workspace.
- No per-trainee roles beyond "admin or not" (see Admins).
- No changes to quiz content, scoring, or the simulator itself.

## Anti-goals

- Share links must never start demanding a sign-in: they go to prospects' colleagues and to
  Slack. If a share page breaks behind auth, that's a bug, not a feature.
- No secrets in the repo (it's public): client id/secret and the session secret live in Vercel
  env and `.env.local`.

## How it works (builder's calls unless marked)

- **Library:** Auth.js v5 (`next-auth@5` beta channel; v4 doesn't fit the App Router) with the
  Google provider, JWT sessions (no database: the KV store isn't an Auth.js adapter and nothing
  needs persisted sessions). Session cookie carries email and name.
- **Domain restriction:** the `signIn` callback rejects any account whose email isn't on
  `honeycomb.io` (env `AUTH_ALLOWED_DOMAIN`, default `honeycomb.io`), checking Google's `hd`
  claim too. Rejected users see a plain "Use your Honeycomb Google account" page.
- **Where the gate lives:** `proxy.ts` (Next 16's name for request middleware) requires a
  session for every route except the open list: `/share/*`, `/leaderboard/share`,
  `/insights/share`, `/api/share/*`, GET on `/api/leaderboard`, `/api/insights`,
  `/api/personas`, `/api/conferences`, `/api/trainees` (names only, as today), `/api/auth/*`,
  Next internals and static assets. Unauthenticated page requests redirect to the sign-in page
  with a return URL; unauthenticated API requests get 401 JSON.
- **Admins:** env `ADMIN_EMAILS` (comma-separated). When set, the admin pages and their mutating
  APIs require membership; when unset, every signed-in `honeycomb.io` user is an admin (today's
  behaviour, minus anonymous access). Admin pages: `/` (Builder), `/admin`, `/editor`,
  `/leaderboard`, `/insights`, `/quiz-results`, `/review/*`, and the APIs they call that aren't
  on the open list.
- **`/start` after sign-in:** the server resolves the trainee by email (`findTraineeByEmail`);
  if none, it creates one from Google's `given_name` / `family_name` (fallback: split `name`)
  with that email, then runs the existing flow (quiz link → random-persona session). The page
  shows "You're *Rick Abruzzo* (rick@honeycomb.io) — Start →" with a "Not you? Sign out" link.
  `/api/start` takes no body from the browser anymore; the identity comes from the session.
  (Rick's choice: match by email, auto-create.)
- **Personal links:** `/api/invite/<token>` and `/api/quiz/<token>` compare the link's trainee
  to the session: match → proceed; trainee has no email → attach the session email and
  proceed; mismatch → 403 `{ code: "wrong_person", traineeName }` unless the caller is an admin.
  The pages render "This link is for *Name*. You're signed in as *email*." with a sign-out link.
- **Sign-in UX:** a `/signin` page with one button ("Sign in with Google"); the TopNav shows the
  signed-in name with a sign-out control on admin pages.
- **Local dev:** works with the same Google client (redirect URI `http://localhost:3000/api/auth/callback/google`).
  `AUTH_MODE=off` disables the gate **only when `NODE_ENV=development`**, for quick local work
  and for tests that don't exercise auth; in production it's ignored.
- **Automation (my preview/prod smoke tests):** scripts mint a session JWT with `AUTH_SECRET`
  via Auth.js's `encode`, so there's no bypass header or back door in the app.
- **Vercel previews:** Google requires exact redirect URIs, so sign-in works on production and
  localhost. For a preview, register its stable branch alias as a redirect URI when needed, or
  test with a minted session cookie.

## Env vars (Rick creates the Google OAuth client)

- `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` — from Google Cloud Console → APIs & Services →
  Credentials → Create credentials → OAuth client ID → Web application. Authorized JavaScript
  origins: `https://honeycomb-simulator.vercel.app`, `http://localhost:3000`. Authorized redirect
  URIs: `https://honeycomb-simulator.vercel.app/api/auth/callback/google`,
  `http://localhost:3000/api/auth/callback/google`. If the OAuth consent screen is "Internal" to
  the Workspace, only honeycomb.io accounts can even start a sign-in.
- `AUTH_SECRET` — 32+ random bytes (the builder generates it; set in Production, Preview and
  `.env.local`).
- `AUTH_ALLOWED_DOMAIN` (optional, default `honeycomb.io`), `ADMIN_EMAILS` (optional).
- `AUTH_TRUST_HOST=true` on Vercel (Auth.js needs it behind the proxy).

## What's left to the builder

- Exact proxy matcher, the 401/redirect shapes, the sign-in page copy and styling (match the
  existing cards), how TopNav shows the signed-in user, test fakes for `auth()`.
- Rollout: ship behind the env vars; until `AUTH_GOOGLE_ID` is set in production the gate must
  fail **closed for admin pages and open for trainee flows?** — No: it fails closed everywhere
  except the open list, with the sign-in page explaining that sign-in isn't configured yet. The
  merge waits until the Google client exists and is verified on production.
