/**
 * Who may see what. Pure functions, so the rules are unit-tested and the request proxy
 * (proxy.ts), the Auth.js callbacks and the route handlers all agree.
 *
 * - Share links (scorecards, shared leaderboard/insights) and the GET APIs they read stay open:
 *   they go to people outside the company.
 * - Everything else needs a signed-in Google account on the allowed domain.
 * - Admin pages and admin APIs additionally need an admin: everyone on the domain when
 *   ADMIN_EMAILS is unset, otherwise only the listed addresses.
 */

type Env = Record<string, string | undefined>;

export function allowedDomain(env: Env = process.env): string {
  return (env.AUTH_ALLOWED_DOMAIN ?? "honeycomb.io").trim().toLowerCase();
}

/** Only AUTH_MODE=off in development switches the gate off; production ignores it. */
export function authDisabled(env: Env = process.env): boolean {
  return env.AUTH_MODE === "off" && env.NODE_ENV === "development";
}

export function isAllowedEmail(
  email: string | null | undefined,
  domain: string = allowedDomain()
): boolean {
  if (!email) return false;
  const at = email.lastIndexOf("@");
  return at > 0 && email.slice(at + 1).toLowerCase() === domain.toLowerCase();
}

export function isAdminEmail(
  email: string | null | undefined,
  adminList: string | undefined = process.env.ADMIN_EMAILS,
  domain: string = allowedDomain()
): boolean {
  if (!isAllowedEmail(email, domain)) return false;
  const list = (adminList ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!list.length) return true; // no list configured: every signed-in colleague is an admin
  return list.includes(email!.toLowerCase());
}

const OPEN_PAGE_PREFIXES = ["/share/", "/api/share/", "/api/auth/", "/_next/", "/brand/"];
const OPEN_PAGES = new Set(["/leaderboard/share", "/insights/share", "/signin", "/favicon.ico"]);
// Read by the shared leaderboard/insights pages (filters and data); GET only.
const OPEN_GET_APIS = new Set(["/api/leaderboard", "/api/insights", "/api/personas", "/api/conferences", "/api/trainees"]);

/** True when the request needs no sign-in at all. `search` is the query string, if any. */
export function isOpenPath(pathname: string, method: string, search = ""): boolean {
  if (OPEN_PAGES.has(pathname)) return true;
  if (OPEN_PAGE_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  if (method.toUpperCase() === "GET" && OPEN_GET_APIS.has(pathname)) {
    // Names are fine for the shared pages' filters; emails are an admin request.
    if (pathname === "/api/trainees" && new URLSearchParams(search).get("include") === "email") return false;
    return true;
  }
  return false;
}

const ADMIN_PAGES = new Set(["/", "/admin", "/editor", "/leaderboard", "/insights", "/quiz-results"]);

/** Admin pages (not APIs). Share views and trainee pages are not admin pages. */
export function isAdminPath(pathname: string): boolean {
  return ADMIN_PAGES.has(pathname) || pathname.startsWith("/review/");
}

/**
 * Admin-only APIs: the Builder/Tracker/Editor/Quiz Results calls, plus any mutation of the data
 * the shared pages read, plus anything that lists emails or exposes a session's hidden attendee
 * profile. The trainee flow needs only a sign-in: /api/start, /api/quiz/*, GET /api/invite/<token>,
 * and their own session's /trainee, /message, /complete, /end and feedback reads.
 */
export function isAdminApi(pathname: string, method: string, search = ""): boolean {
  const m = method.toUpperCase();
  if (pathname.startsWith("/api/admin/") || pathname === "/api/bootstrap") return true;
  if (pathname === "/api/quiz-links" || pathname.startsWith("/api/quiz-links/")) return true;
  // Creating or deleting a practice link is the Builder's; a trainee only ever GETs their own.
  if (pathname === "/api/invite" || pathname.startsWith("/api/invite/")) return m !== "GET";
  if (pathname.startsWith("/api/review/") || pathname.startsWith("/api/enrichment/")) return true;
  if (pathname === "/api/session/start") return true;
  const session = pathname.match(/^\/api\/session\/[^/]+(\/[^/]+)?$/);
  if (session) {
    const sub = session[1] ?? "";
    if (sub === "") return true; // the whole session, attendee profile included: /trainee is the redacted view
    if (sub === "/feedback") return m !== "GET";
    return false;
  }
  if (pathname === "/api/trainees") return m !== "GET" || new URLSearchParams(search).get("include") === "email";
  if (pathname.startsWith("/api/trainees/")) return true;
  if (pathname === "/api/leaderboard" || pathname.startsWith("/api/leaderboard/")) return m !== "GET";
  if (pathname === "/api/insights" || pathname.startsWith("/api/insights/")) return m !== "GET";
  if (pathname === "/api/personas" || pathname.startsWith("/api/personas/")) return m !== "GET";
  if (pathname === "/api/conferences" || pathname.startsWith("/api/conferences/")) return m !== "GET";
  return false;
}
