import { NextResponse } from "next/server";
import { ensureTraineesSeeded, listTrainees } from "@/lib/traineeStore";

export const dynamic = "force-dynamic";

/**
 * Public: the names on the /start picker. Names only, sorted by last name. Emails stay out of
 * this response on purpose (they're for admins); use /api/trainees for the admin view.
 */
export async function GET() {
  await ensureTraineesSeeded();
  const trainees = (await listTrainees(false))
    .map(({ id, firstName, lastName }) => ({ id, firstName, lastName }))
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
  return NextResponse.json({ trainees }, { headers: { "Cache-Control": "no-store" } });
}
