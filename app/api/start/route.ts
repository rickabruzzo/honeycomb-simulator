import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { traineeForUser } from "@/lib/auth/traineeForUser";
import { createInvite } from "@/lib/createInvite";
import { getInvite } from "@/lib/invites";
import { invalidateBootstrapCache } from "@/lib/memoryStore";
import { ensurePersonasSeeded, listPersonas } from "@/lib/personaStore";
import { getQuizBank, isQuizUsable } from "@/lib/quiz/bank";
import { getOrCreateQuizLink, traineePassed } from "@/lib/quiz/store";
import { getScore } from "@/lib/scoreStore";
import { getSelfServeInvite, pickSelfServeNext, rememberSelfServeInvite } from "@/lib/selfServe";
import { getSession } from "@/lib/storage";
import { withSpan } from "@/lib/telemetry";
import { ensureTraineesSeeded, findTraineeByEmail } from "@/lib/traineeStore";

/**
 * The generic link's one action, for the signed-in Google user. Their email finds (or creates)
 * their trainee record; then the server makes sure they have a quiz link and an unfinished
 * random-persona practice session, and answers with where to send them: the quiz (session
 * attached) or, once passed, the session itself. The body is ignored: identity is the session.
 */
export async function POST() {
  return withSpan("hc.event.self_serve_start", async (span) => {
    const session = await auth();
    const user = session?.user;
    if (!user?.email) {
      return NextResponse.json({ error: "Sign in required", code: "unauthenticated" }, { status: 401 });
    }
    await ensureTraineesSeeded();

    const existedBefore = Boolean(await findTraineeByEmail(user.email));
    const trainee = await traineeForUser({
      email: user.email,
      name: user.name,
      givenName: user.givenName,
      familyName: user.familyName,
    });
    const traineeName = `${trainee.firstName} ${trainee.lastName}`.trim();
    span.setAttribute("trainee_id", trainee.id);
    span.setAttribute("self_serve.added", !existedBefore);
    if (!existedBefore) invalidateBootstrapCache(); // so the Builder's select shows them right away

    const bank = await getQuizBank();
    const passed = !isQuizUsable(bank) || (await traineePassed(trainee.id, bank));
    const quizLink = await getOrCreateQuizLink(trainee.id);
    if (!quizLink) return NextResponse.json({ error: "Trainee not found" }, { status: 404 });

    // The session we last handed this person. Resume it only while it's still open and unscored;
    // an ended, scored or deleted session would strand them on "This session has ended".
    let existing: { token: string; resumable: boolean } | null = null;
    const rememberedToken = await getSelfServeInvite(trainee.id);
    if (rememberedToken) {
      const invite = await getInvite(rememberedToken);
      if (invite && !invite.revoked) {
        const [sess, score] = await Promise.all([getSession(invite.sessionId), getScore(rememberedToken)]);
        existing = { token: rememberedToken, resumable: Boolean(sess?.active) && !score };
      }
    }

    let picked: Awaited<ReturnType<typeof pickSelfServeNext>>;
    try {
      picked = await pickSelfServeNext({
        passed,
        quizToken: quizLink.token,
        existing,
        createInvite: async () => {
          await ensurePersonasSeeded();
          const personas = await listPersonas(false);
          if (!personas.length) throw new Error("No personas available");
          const persona = personas[Math.floor(Math.random() * personas.length)];
          const made = await createInvite({
            personaId: persona.id,
            traineeId: trainee.id,
            // Training wheels for a first run only; once they've practiced, sessions are unassisted.
            trainingWheels: !trainee.firstPracticeAt,
            createdBy: "self-serve",
          });
          if (!made.ok) throw new Error(made.error);
          await rememberSelfServeInvite(trainee.id, made.token);
          return made.token;
        },
      });
    } catch (err) {
      console.error("[start] couldn't start a practice session:", err);
      span.setAttribute("error", err instanceof Error ? err.message : "unknown");
      return NextResponse.json({ error: "Couldn't start a practice session" }, { status: 500 });
    }

    span.setAttribute("self_serve.passed", passed);
    span.setAttribute("self_serve.reused_session", picked.reused);
    span.setAttribute("invite_token", picked.inviteToken);
    return NextResponse.json({ next: picked.next, traineeName, passed });
  }, { route: "/api/start", method: "POST" });
}
