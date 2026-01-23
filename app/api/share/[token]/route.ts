import { NextResponse } from "next/server";
import { getScore } from "@/lib/scoreStore";

export async function GET(req: Request, ctx: any) {
  // Works across Next 15 / 16 / Turbopack
  const { token } = await Promise.resolve(ctx.params);

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const score = await getScore(token);

  if (!score) {
    return NextResponse.json(
      { error: "Score not found" },
      { status: 404 }
    );
  }

  // Return score WITHOUT attendeeProfile (it's not in ScoreRecord anyway)
  return NextResponse.json(score);
}
