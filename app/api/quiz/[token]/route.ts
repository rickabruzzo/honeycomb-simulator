import { NextResponse } from "next/server";
import { withSpan } from "@/lib/telemetry";
import { getQuizBank, isQuizUsable } from "@/lib/quiz/bank";
import { getPass, startAttempt, traineeKeyForToken } from "@/lib/quiz/store";

/** Quiz status for an invite: is the quiz required, and has this trainee passed it? */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  return withSpan("hc.quiz.status", async (span) => {
    const { token } = await ctx.params;
    const bank = await getQuizBank();
    if (!isQuizUsable(bank)) {
      span.setAttribute("quiz.required", false);
      return NextResponse.json({ required: false, passed: true });
    }
    const traineeKey = await traineeKeyForToken(token);
    if (!traineeKey) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    const pass = await getPass(traineeKey, bank);
    span.setAttribute("quiz.required", true);
    span.setAttribute("quiz.passed", Boolean(pass));
    return NextResponse.json({
      required: true,
      passed: Boolean(pass),
      pass,
      questionsPerAttempt: bank.questionsPerAttempt,
      passPercent: bank.passPercent,
      sources: bank.sources,
    });
  }, { route: "/api/quiz/[token]", method: "GET" });
}

/** Start a new attempt: draws the questions and returns them without answers. */
export async function POST(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  return withSpan("hc.quiz.start", async (span) => {
    const { token } = await ctx.params;
    const bank = await getQuizBank();
    if (!isQuizUsable(bank)) {
      return NextResponse.json({ error: "Quiz unavailable" }, { status: 404 });
    }
    const traineeKey = await traineeKeyForToken(token);
    if (!traineeKey) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    const { attemptId, questions } = await startAttempt(token, traineeKey, bank);
    span.setAttribute("quiz.attempt_id", attemptId);
    span.setAttribute("quiz.bank_version", bank.version);
    return NextResponse.json({ attemptId, questions });
  }, { route: "/api/quiz/[token]", method: "POST" });
}
