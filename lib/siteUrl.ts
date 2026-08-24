/**
 * Canonical, absolute base URL for shareable links — practice invites, scorecards,
 * leaderboard, and insights.
 *
 * Links are copied by an admin and opened by someone else, so they must point at the real
 * site, never at whatever ephemeral `*-<hash>.vercel.app` deployment the admin happened to
 * be viewing. Set NEXT_PUBLIC_SITE_URL to the canonical host (e.g.
 * https://honeycomb-simulator.vercel.app) and every link routes through it.
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_SITE_URL         — the canonical host (inlined at build, client + server)
 *   2. window.location.origin       — client fallback when the env var is unset
 *   3. VERCEL_PROJECT_PRODUCTION_URL / VERCEL_URL — server fallback on Vercel
 *   4. a relative path              — last resort; works same-origin, never throws
 */
export function siteUrl(path = ""): string {
  const p = path === "" || path.startsWith("/") ? path : `/${path}`;

  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (configured) return `${configured}${p}`;

  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${p}`;
  }

  const vercelHost = (
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
  )?.replace(/\/+$/, "");
  if (vercelHost) return `https://${vercelHost}${p}`;

  return p; // relative fallback — resolves correctly only on the same origin
}
