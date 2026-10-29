import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { checkOwnership } from "./ownership";
import { isAdminEmail } from "./policy";
import { getTrainee, upsertTrainee } from "../traineeStore";

/**
 * Route helper for personal links: resolves the session and the link's trainee and applies
 * checkOwnership. On "attach" it saves the email onto the legacy record. Returns the JSON
 * response to send when the caller may not proceed.
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
    return {
      ok: false,
      response: NextResponse.json({ error: "Sign in required", code: "unauthenticated" }, { status: 401 }),
    };
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
