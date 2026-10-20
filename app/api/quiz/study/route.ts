import { NextResponse } from "next/server";
import { getQuizBank } from "@/lib/quiz/bank";

/** Study material for the /study page: source links and the Booth FAQ (both live outside the repo). */
export async function GET() {
  const bank = await getQuizBank();
  return NextResponse.json({
    sources: bank?.sources ?? [],
    faqMarkdown: bank?.faqMarkdown ?? null,
  });
}
