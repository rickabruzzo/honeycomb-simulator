import { redirect } from "next/navigation";
import { auth, authConfigured, signIn } from "@/auth";
import { allowedDomain, isAllowedEmail } from "@/lib/auth/policy";
import { safeCallbackUrl, signinDestination } from "@/lib/auth/signinRedirect";

/**
 * The one sign-in page. Google only, restricted to the company's Workspace domain. Also where
 * Auth.js sends errors (?error=AccessDenied for a non-company account) and where the proxy
 * sends people who need an admin account (?error=NotAdmin).
 */
export const metadata = { title: "Sign in - Honeycomb Simulator" };

const ERRORS: Record<string, string> = {
  AccessDenied: `Use your Honeycomb Google account (an @${allowedDomain()} address).`,
  NotAdmin: "That page is for trainers. You're signed in, but your account isn't on the admin list.",
  Configuration: "Sign-in isn't configured on this deployment yet.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { callbackUrl, error: errorParam } = await searchParams;
  const error = Array.isArray(errorParam) ? errorParam[0] : errorParam;
  const redirectTo = safeCallbackUrl(callbackUrl);

  const session = await auth();
  const email = session?.user?.email ?? null;
  const destination = signinDestination({ email, error, callbackUrl });
  if (destination) redirect(destination);

  // A session from outside the domain is shown the way out here; redirecting it on would only
  // bounce it between the gate and this page.
  const wrongDomain = Boolean(email) && !isAllowedEmail(email);
  const message = wrongDomain
    ? `You're signed in as ${email}. ${ERRORS.AccessDenied}`
    : error
      ? ERRORS[error] ?? "Sign-in didn't complete. Try again."
      : null;

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-white/7 p-6 sm:p-7 shadow-sm flex flex-col gap-5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/40">Booth training</span>
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-2xl font-semibold text-white">Sign in to continue</h1>
          <p className="text-sm leading-relaxed text-white/65">
            Use your Honeycomb Google account. It identifies you for the quiz and your practice sessions, and nothing
            else is stored.
          </p>
        </div>

        {message && (
          <div className="rounded-lg border border-[#ffb000]/30 bg-[#ffb000]/8 px-3.5 py-3 text-sm text-[#ffd27a]">{message}</div>
        )}

        {authConfigured ? (
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo });
            }}
          >
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-2.5 rounded-md bg-white px-5 py-2.5 text-sm font-semibold text-[#25303e] hover:bg-white/90"
            >
              <GoogleMark />
              Sign in with Google
            </button>
          </form>
        ) : (
          <p className="text-sm text-white/55">
            Sign-in isn&apos;t configured on this deployment yet (missing the Google client). Ask your trainer.
          </p>
        )}

        {(error === "NotAdmin" || wrongDomain) && (
          <form
            action={async () => {
              "use server";
              const { signOut } = await import("@/auth");
              await signOut({ redirectTo: "/signin" });
            }}
          >
            <button type="submit" className="text-sm text-white/60 underline underline-offset-4 hover:text-white">
              Sign out and use a different account
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6.1C12.3 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17z" />
      <path fill="#FBBC05" d="M10.4 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.8-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.7-4.1-13.6-9.9l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}
