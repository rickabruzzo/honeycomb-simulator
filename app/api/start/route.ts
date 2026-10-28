import { NextResponse } from "next/server";
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
import {
  ensureTraineesSeeded,
  findTraineeByEmail,
  findTraineeByName,
  getTrainee,
  normalizeEmail,
  upsertTrainee,
  type Trainee,
} from "@/lib/traineeStore";

/**
 * Public: the generic link's one action. Body is either `{ traineeId }` (picked a name) or
 * `{ firstName, lastName, email }` (added themselves; email required). Resolves the person, makes
 * sure they have a quiz link and an unfinished random-persona practice session, and answers with
 * where to send them: the quiz (with the session attached) or, once passed, the session itself.
 */
export async function POST(req: Request) {
  return withSpan("hc.event.self_serve_start", async (span) => {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }
    await ensureTraineesSeeded();

    const resolved = await resolveTrainee(body);
    if ("response" in resolved) return resolved.response;
    const trainee = resolved.trainee;
    const traineeName = `${trainee.firstName} ${trainee.lastName}`.trim();
    span.setAttribute("trainee_id", trainee.id);
    span.setAttribute("self_serve.added", resolved.added);
    if (resolved.added) invalidateBootstrapCache(); // so the Builder's select shows them right away

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
        const [session, score] = await Promise.all([getSession(invite.sessionId), getScore(rememberedToken)]);
        existing = { token: rememberedToken, resumable: Boolean(session?.active) && !score };
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

type Resolved = { trainee: Trainee; added: boolean } | { response: NextResponse };

async function resolveTrainee(body: Record<string, unknown>): Promise<Resolved> {
  if (typeof body.traineeId === "string" && body.traineeId) {
    const trainee = await getTrainee(body.traineeId);
    if (!trainee || trainee.isArchived) {
      return { response: NextResponse.json({ error: "That name isn't in the list any more" }, { status: 404 }) };
    }
    return { trainee, added: false };
  }

  const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
  const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
  const emailRaw = typeof body.email === "string" ? body.email : "";
  if (!firstName || !lastName) {
    return { response: NextResponse.json({ error: "First and last name are required" }, { status: 400 }) };
  }
  const email = normalizeEmail(emailRaw);
  if (!email) {
    return {
      response: NextResponse.json(
        { error: emailRaw.trim() ? "That email address doesn't look right" : "Email is required" },
        { status: 400 }
      ),
    };
  }

  const existing = (await findTraineeByName(firstName, lastName)) ?? (await findTraineeByEmail(email));
  if (existing) {
    return {
      response: NextResponse.json(
        {
          error: "You're already in the system",
          code: "exists",
          trainee: { id: existing.id, firstName: existing.firstName, lastName: existing.lastName },
        },
        { status: 409 }
      ),
    };
  }
  return { trainee: await upsertTrainee({ firstName, lastName, email }), added: true };
}
