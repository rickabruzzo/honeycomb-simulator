import { NextRequest, NextResponse } from "next/server";
import {
  findTraineeByEmail,
  findTraineeByName,
  getTrainee,
  listTrainees,
  normalizeEmail,
  upsertTrainee,
} from "@/lib/traineeStore";
import { Trainee } from "@/lib/traineeStore";
import { invalidateBootstrapCache } from "@/lib/memoryStore";

export async function GET(request: Request) {
  try {
    const trainees = await listTrainees(false); // Exclude archived
    // Emails are for admins. The shared leaderboard/insights pages also load this list (for a
    // filter), so emails are left out unless the caller asks with ?include=email.
    const includeEmail = new URL(request.url).searchParams.get("include") === "email";
    const withoutEmail = (t: Trainee): Trainee => {
      const copy = { ...t };
      delete copy.email;
      return copy;
    };
    return NextResponse.json({ trainees: includeEmail ? trainees : trainees.map(withoutEmail) });
  } catch (error) {
    console.error("Failed to list trainees:", error);
    return NextResponse.json(
      { error: "Failed to load trainees" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.firstName || typeof body.firstName !== "string") {
      return NextResponse.json(
        { error: "Missing required field: firstName" },
        { status: 400 }
      );
    }

    if (!body.lastName || typeof body.lastName !== "string") {
      return NextResponse.json(
        { error: "Missing required field: lastName" },
        { status: 400 }
      );
    }

    // Email is optional here (admins add people by name); when given it has to look like one.
    if (body.email !== undefined && body.email !== "") {
      if (typeof body.email !== "string" || !normalizeEmail(body.email)) {
        return NextResponse.json(
          { error: "That email address doesn't look right" },
          { status: 400 }
        );
      }
    }

    // An email that belongs to someone else must not be moved onto this name (the by-name
    // upsert below would otherwise silently overwrite that other trainee's address).
    if (typeof body.email === "string" && body.email !== "") {
      const owner = await findTraineeByEmail(body.email);
      const target = body.id ? await getTrainee(body.id) : await findTraineeByName(body.firstName, body.lastName);
      if (owner && owner.id !== target?.id) {
        return NextResponse.json(
          { error: `That email already belongs to ${owner.firstName} ${owner.lastName}`.trim() },
          { status: 409 }
        );
      }
    }

    // Upsert trainee (creates if missing id, updates if present). An empty email means
    // "not provided", so it's left out rather than wiping a stored address.
    const { email, ...rest } = body as Partial<Trainee> & { firstName: string; lastName: string };
    const trainee = await upsertTrainee(email ? { ...rest, email } : rest);

    // Invalidate bootstrap cache so new trainee appears in Builder immediately
    invalidateBootstrapCache();

    return NextResponse.json({ trainee });
  } catch (error) {
    console.error("Failed to upsert trainee:", error);
    return NextResponse.json(
      { error: "Failed to save trainee" },
      { status: 500 }
    );
  }
}
