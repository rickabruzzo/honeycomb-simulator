import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import type { SessionState } from "@/lib/storage";
import { scoreSession } from "@/lib/scoring";
import { saveScore } from "@/lib/scoreStore";
import { addToLeaderboardIndex } from "@/lib/leaderboardStore";
import { getPersona } from "@/lib/personaStore";
import { upsertTrainee, formatTraineeShort } from "@/lib/traineeStore";

/**
 * Admin: grade a VERBATIM transcript (both sides, exactly as it happened) and persist the score +
 * leaderboard entry. This is the only path that scores a real/pasted conversation word-for-word —
 * the normal message flow regenerates the attendee. The prod server grades it with the LIVE rubric.
 *
 * Auth: x-admin-reset-token must match ADMIN_RESET_TOKEN.
 *
 * Body: {
 *   personaId: string,
 *   firstName: string, lastName: string,      // trainee to attribute the run to
 *   pairs: [traineeText, attendeeText][],      // conversation turns in order
 *   opener?: string,                           // attendee's opening line (default "*approaches booth casually*")
 *   attendeeProfile?: string,                  // hidden profile for the judge; falls back to persona metadata
 *   detectedOutcome?: string,                  // e.g. "MQL_READY"; informs the handoff read
 * }
 */
export async function POST(req: NextRequest) {
  const adminToken = req.headers.get("x-admin-reset-token");
  const expected = process.env.ADMIN_RESET_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: "ADMIN_RESET_TOKEN not configured" }, { status: 500 });
  }
  if (!adminToken || adminToken !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.pairs) || !body.personaId || !body.firstName || !body.lastName) {
    return NextResponse.json(
      { error: "Required: personaId, firstName, lastName, pairs[[trainee, attendee], ...]" },
      { status: 400 }
    );
  }

  const persona = await getPersona(body.personaId);
  if (!persona) {
    return NextResponse.json({ error: `Unknown personaId: ${body.personaId}` }, { status: 400 });
  }

  const trainee = await upsertTrainee({ firstName: body.firstName, lastName: body.lastName });

  const attendeeProfile: string =
    body.attendeeProfile ||
    [
      `Persona: ${persona.personaType}`,
      `Modifiers: ${(persona.modifiers ?? []).join(", ")}`,
      `Emotional posture: ${persona.emotionalPosture}`,
      `Tooling bias: ${persona.toolingBias}`,
      `OpenTelemetry familiarity: ${persona.otelFamiliarity}`,
      persona.behaviorBrief ? `Notes: ${persona.behaviorBrief}` : "",
    ]
      .filter(Boolean)
      .join("\n");

  // Build the transcript verbatim. Timestamps are synthetic, one minute apart.
  const transcript: SessionState["transcript"] = [];
  let t = Date.parse("2026-08-22T00:00:00Z");
  const push = (type: "system" | "trainee" | "attendee", text: string) =>
    transcript.push({ id: randomUUID(), type, text, timestamp: new Date(t).toISOString() } as never);

  push("system", "Session started. Current state: ICEBREAKER");
  push("attendee", typeof body.opener === "string" ? body.opener : "*approaches booth casually*");
  for (const pair of body.pairs as [string, string][]) {
    t += 60_000;
    push("trainee", String(pair?.[0] ?? ""));
    push("attendee", String(pair?.[1] ?? ""));
  }

  const token = randomUUID();
  const detectedType = typeof body.detectedOutcome === "string" ? body.detectedOutcome : undefined;

  const session = {
    id: randomUUID(),
    active: false,
    currentState: "OUTCOME",
    startTime: transcript[0].timestamp,
    transcript,
    violations: [],
    stateHistory: [],
    kickoff: {
      personaId: body.personaId,
      personaDisplayName: persona.name,
      traineeId: trainee.id,
      traineeNameShort: formatTraineeShort(trainee),
      attendeeProfile,
    },
    momentum: { score: 45 },
    detectedOutcome: detectedType ? { type: detectedType } : undefined,
    pendingOutcome: detectedType,
    trainingWheels: false,
  } as unknown as SessionState;

  try {
    const record = await scoreSession(session, token);
    await saveScore(record);
    await addToLeaderboardIndex({
      token: record.token,
      score: record.score,
      grade: record.grade,
      createdAt: record.completedAt,
      personaId: record.personaId || null,
      personaDisplayName: record.personaDisplayName || null,
      jobTitle: null,
      traineeId: record.traineeId || null,
      traineeNameShort: record.traineeNameShort || null,
    });

    return NextResponse.json({
      ok: true,
      token: record.token,
      shareUrl: `/share/${record.token}`,
      score: record.score,
      grade: record.grade,
      breakdown: record.breakdown,
      scoringMethod: record.scoringMethod,
      highlights: record.highlights,
      mistakes: record.mistakes,
    });
  } catch (error) {
    console.error("[grade-transcript] failed:", error);
    return NextResponse.json(
      { error: "Grading failed", details: error instanceof Error ? error.message : "unknown" },
      { status: 500 }
    );
  }
}
