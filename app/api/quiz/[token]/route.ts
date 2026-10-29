import { NextResponse } from "next/server";
import { withSpan } from "@/lib/telemetry";
import { getQuizBank, isQuizUsable } from "@/lib/quiz/bank";
import { getQuizLink, startAttempt, traineePassed } from "@/lib/quiz/store";
import { requireLinkOwner } from "@/lib/auth/requireLinkOwner";

/** Quiz status for a personal quiz link: who it's for and whether they've passed. */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  return withSpan("hc.quiz.status", async (span) => {
    const { token } = await ctx.params;
    const link = await getQuizLink(token);
    if (!link) return NextResponse.json({ error: "Quiz link not found" }, { status: 404 });
    const owner = await requireLinkOwner(link.traineeId);
    if (!owner.ok) return owner.response;
    const bank = await getQuizBank();
    if (!isQuizUsable(bank)) {
      return NextResponse.json({ available: false, traineeName: link.traineeName });
    }
    const passed = await traineePassed(link.traineeId, bank);
    span.setAttribute("quiz.passed", passed);
    return NextResponse.json({
      available: true,
      traineeName: link.traineeName,
      passed,
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
    const link = await getQuizLink(token);
    if (!link) return NextResponse.json({ error: "Quiz link not found" }, { status: 404 });
    const owner = await requireLinkOwner(link.traineeId);
    if (!owner.ok) return owner.response;
    const bank = await getQuizBank();
    if (!isQuizUsable(bank)) return NextResponse.json({ error: "Quiz unavailable" }, { status: 404 });
    const { attemptId, questions } = await startAttempt(link, bank);
    span.setAttribute("quiz.attempt_id", attemptId);
    span.setAttribute("quiz.bank_version", bank.version);
    span.setAttribute("trainee_id", link.traineeId);
    return NextResponse.json({ attemptId, questions });
  }, { route: "/api/quiz/[token]", method: "POST" });
}
