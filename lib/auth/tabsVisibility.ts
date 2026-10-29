/**
 * Where the admin tabs (Builder, Tracker, Leaderboard…) appear. Only admins ever see them, and for
 * them the tabs stay up everywhere — including the trainee-facing /start, quiz and practice pages —
 * except the sign-in page and the read-only share views, which should look the same to whoever
 * opens them.
 */
const HIDDEN_FOR_EVERYONE = new Set(["/signin", "/leaderboard/share", "/insights/share"]);

export function showAdminTabs(pathname: string | null | undefined, isAdmin: boolean): boolean {
  if (!isAdmin || !pathname) return false;
  if (HIDDEN_FOR_EVERYONE.has(pathname)) return false;
  if (pathname.startsWith("/share/")) return false;
  return true;
}
