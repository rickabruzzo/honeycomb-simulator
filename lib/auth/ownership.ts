import { normalizeEmail, type Trainee } from "../traineeStore";

/**
 * Personal links (/q/<token>, /s/<token>) belong to one trainee. The signed-in Google account
 * must be that trainee, or an admin. A record from before sign-in existed (no email) adopts the
 * signed-in email on first use instead of locking its owner out. Pure: the route helper that
 * reads the session lives in requireLinkOwner.ts.
 */
export type Ownership = "ok" | "attach" | "wrong_person" | "unauthenticated";

export function checkOwnership(
  sessionEmail: string | null | undefined,
  trainee: Trainee | null,
  isAdmin: boolean
): Ownership {
  const email = sessionEmail ? normalizeEmail(sessionEmail) : null;
  if (!email) return "unauthenticated";
  if (isAdmin || !trainee) return "ok";
  if (!trainee.email) return "attach";
  return trainee.email === email ? "ok" : "wrong_person";
}
