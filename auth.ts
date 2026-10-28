import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import { allowedDomain, isAllowedEmail } from "@/lib/auth/policy";

/**
 * Google sign-in (Auth.js v5), restricted to the company's Google Workspace domain. JWT
 * sessions: nothing is stored server-side, the cookie carries email and name. Env:
 * AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET (read by the provider), AUTH_SECRET, AUTH_TRUST_HOST,
 * optional AUTH_ALLOWED_DOMAIN (default honeycomb.io).
 */

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & { givenName?: string; familyName?: string };
  }
}

export const authConfigured = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      // `hd` pre-selects the Workspace domain on Google's chooser; the signIn callback is the
      // real check (hd is a hint, not a guarantee).
      authorization: { params: { hd: allowedDomain(), prompt: "select_account" } },
    }),
  ],
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: "/signin", error: "/signin" },
  callbacks: {
    signIn({ profile }) {
      const email = profile?.email;
      const hd = typeof profile?.hd === "string" ? profile.hd.toLowerCase() : null;
      if (!isAllowedEmail(email)) return false;
      if (hd && hd !== allowedDomain()) return false;
      return Boolean(profile?.email_verified ?? true);
    },
    jwt({ token, profile }) {
      if (profile) {
        if (typeof profile.given_name === "string") token.givenName = profile.given_name;
        if (typeof profile.family_name === "string") token.familyName = profile.family_name;
      }
      return token;
    },
    session({ session, token }) {
      if (typeof token.givenName === "string") session.user.givenName = token.givenName;
      if (typeof token.familyName === "string") session.user.familyName = token.familyName;
      return session;
    },
  },
});
