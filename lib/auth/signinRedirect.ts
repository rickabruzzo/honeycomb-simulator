import { isAllowedEmail } from "./policy";

const FALLBACK = "/start";
const LOCAL = "http://local.invalid";

/**
 * The same-site path to continue to after sign-in, or /start. Parsed rather than pattern-matched:
 * "//evil.com" and "/\evil.com" both resolve off-site in a browser, and Next's redirect() writes
 * the string verbatim. The sign-in page itself is never a destination (it would loop).
 */
export function safeCallbackUrl(value: unknown, fallback: string = FALLBACK): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string" || !raw.startsWith("/")) return fallback;
  if (/[\\\s\u0000-\u001f]/.test(raw)) return fallback;
  let url: URL;
  try {
    url = new URL(raw, LOCAL);
  } catch {
    return fallback;
  }
  if (url.origin !== LOCAL) return fallback;
  if (url.pathname === "/signin" || url.pathname.startsWith("/signin/")) return fallback;
  return url.pathname + url.search;
}

/**
 * Where /signin should send an already signed-in visitor, or null to render the page: nobody is
 * signed in, the session's email is outside the allowed domain (the gate would only send them
 * straight back here), or they were turned away from an admin page.
 */
export function signinDestination(opts: {
  email: string | null | undefined;
  error: string | null | undefined;
  callbackUrl: unknown;
}): string | null {
  if (!opts.email || !isAllowedEmail(opts.email)) return null;
  if (opts.error === "NotAdmin") return null;
  return safeCallbackUrl(opts.callbackUrl);
}
