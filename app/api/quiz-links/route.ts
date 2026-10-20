import { NextResponse } from "next/server";
import { withSpan } from "@/lib/telemetry";
import { getQuizBank } from "@/lib/quiz/bank";
import { getOrCreateQuizLink, listQuizRecords } from "@/lib/quiz/store";

/** Admin: every trainee with a quiz link, with their attempts and pass status. */
export async function GET() {
  return withSpan("hc.quiz.results_list", async (span) => {
    const bank = await getQuizBank();
    const records = await listQuizRecords(bank);
    span.setAttribute("quiz.trainees", records.length);
    return NextResponse.json({
      records,
      bank: bank
        ? { questions: bank.questions.length, perAttempt: bank.questionsPerAttempt, passPercent: bank.passPercent }
        : null,
    });
  }, { route: "/api/quiz-links", method: "GET" });
}

/** Admin: get (or create) a trainee's personal quiz link. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const traineeId = typeof body?.traineeId === "string" ? body.traineeId : "";
  if (!traineeId) return NextResponse.json({ error: "traineeId is required" }, { status: 400 });
  const link = await getOrCreateQuizLink(traineeId);
  if (!link) return NextResponse.json({ error: "Trainee not found" }, { status: 404 });
  return NextResponse.json({ ...link, url: `/q/${link.token}` });
}
