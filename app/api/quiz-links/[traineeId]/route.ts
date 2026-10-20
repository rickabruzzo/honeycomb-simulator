import { NextResponse } from "next/server";
import { deleteQuizTrainee } from "@/lib/quiz/store";

/**
 * Admin: remove a trainee's quiz link and all their quiz results, including the pass (so they'll
 * need to pass again before practicing). Unauthenticated, matching the app's other admin actions.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ traineeId: string }> }) {
  const { traineeId } = await ctx.params;
  const existed = await deleteQuizTrainee(traineeId);
  if (!existed) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
