import { NextResponse } from "next/server";
import { withSpan } from "@/lib/telemetry";
import { getQuizBank, isQuizUsable } from "@/lib/quiz/bank";
import { answerQuestion, getQuizLink } from "@/lib/quiz/store";
import { requireLinkOwner } from "@/lib/auth/requireLinkOwner";

const STATUS = { not_found: 404, bad_request: 400, bank_changed: 409 } as const;

/** Check one answer. Returns the verdict and explanations; the final answer also returns the result. */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  return withSpan("hc.quiz.answer", async (span) => {
    const { token } = await ctx.params;
    const body = await req.json().catch(() => null);
    const attemptId = typeof body?.attemptId === "string" ? body.attemptId : "";
    const index = Number(body?.index);
    const pos = Number(body?.pos);
    if (!attemptId || !Number.isInteger(index) || !Number.isInteger(pos)) {
      return NextResponse.json({ error: "attemptId, index and pos are required" }, { status: 400 });
    }
    const link = await getQuizLink(token);
    if (!link) return NextResponse.json({ error: "Quiz link not found" }, { status: 404 });
    const owner = await requireLinkOwner(link.traineeId);
    if (!owner.ok) return owner.response;
    const bank = await getQuizBank();
    if (!isQuizUsable(bank)) return NextResponse.json({ error: "Quiz unavailable" }, { status: 404 });

    const out = await answerQuestion(link, attemptId, index, pos, bank);
    if ("error" in out) {
      span.setAttribute("error", out.error);
      return NextResponse.json({ error: out.error }, { status: STATUS[out.error] });
    }
    span.setAttribute("quiz.attempt_id", attemptId);
    span.setAttribute("quiz.correct", out.correct);
    span.setAttribute("quiz.partial", out.partial);
    if (out.result) {
      span.setAttribute("quiz.grade", out.result.grade);
      span.setAttribute("quiz.passed", out.result.passed);
      span.setAttribute("quiz.points", out.result.points);
    }
    return NextResponse.json(out);
  }, { route: "/api/quiz/[token]/answer", method: "POST" });
}
