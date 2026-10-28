import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "./policy";
import { getTrainee, normalizeEmail, upsertTrainee, type Trainee } from "../traineeStore";

/**
 * Personal links (/q/<token>, /s/<token>) belong to one trainee. The signed-in Google account
 * must be that trainee, or an admin. A record from before sign-in existed (no email) adopts the
 * signed-in email on first use instead of locking its owner out.
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

/**
 * Route helper: resolves the session and the link's trainee and applies checkOwnership. On
 * "attach" it saves the email. Returns the JSON response to send when the caller may not proceed.
 */
export async function requireLinkOwner(
  traineeId: string | null | undefined
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  if (!traineeId) return { ok: true };
  const session = await auth();
  const email = session?.user?.email ?? null;
  const trainee = await getTrainee(traineeId);
  const verdict = checkOwnership(email, trainee, isAdminEmail(email));
  if (verdict === "unauthenticated") {
    return { ok: false, response: NextResponse.json({ error: "Sign in required", code: "unauthenticated" }, { status: 401 }) };
  }
  if (verdict === "wrong_person") {
    const traineeName = trainee ? `${trainee.firstName} ${trainee.lastName}`.trim() : "";
    return {
      ok: false,
      response: NextResponse.json(
        { error: `This link is for ${traineeName}`, code: "wrong_person", traineeName, signedInAs: email },
        { status: 403 }
      ),
    };
  }
  if (verdict === "attach" && trainee && email) {
    await upsertTrainee({ ...trainee, email });
  }
  return { ok: true };
}
