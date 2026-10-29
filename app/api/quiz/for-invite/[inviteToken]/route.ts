import { NextResponse } from "next/server";
import { getQuizBank, isQuizUsable } from "@/lib/quiz/bank";
import { getOrCreateQuizLink, traineeIdForInvite, traineePassed } from "@/lib/quiz/store";
import { requireLinkOwner } from "@/lib/auth/requireLinkOwner";

/**
 * Used by a practice link: is the quiz required for this trainee, have they passed, and where is
 * their quiz? Creates their personal quiz link on first ask, so nobody has to send it separately.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ inviteToken: string }> }) {
  const { inviteToken } = await ctx.params;
  const bank = await getQuizBank();
  if (!isQuizUsable(bank)) return NextResponse.json({ required: false, passed: true });
  const traineeId = await traineeIdForInvite(inviteToken);
  if (!traineeId) return NextResponse.json({ required: false, passed: true });
  const owner = await requireLinkOwner(traineeId);
  if (!owner.ok) return owner.response;
  if (await traineePassed(traineeId, bank)) return NextResponse.json({ required: true, passed: true });
  const link = await getOrCreateQuizLink(traineeId);
  return NextResponse.json({
    required: true,
    passed: false,
    quizUrl: link ? `/q/${link.token}` : null,
  });
}
