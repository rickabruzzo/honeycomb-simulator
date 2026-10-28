import { NextResponse } from "next/server";
import { invalidateBootstrapCache } from "@/lib/memoryStore";
import { parseTraineeCsv, planTraineeImport } from "@/lib/traineeCsv";
import { listTrainees, upsertTrainee } from "@/lib/traineeStore";

const MAX_CSV_BYTES = 200 * 1024;

/**
 * Admin: import trainees from a CSV (first, last, email; header optional). Without `commit` it
 * only returns the plan, so the Builder can show "N new · N updated · N skipped" first. With
 * `commit: true` it applies that plan. Unauthenticated, like the other admin actions.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const csv = typeof body?.csv === "string" ? body.csv : "";
  if (!csv.trim()) return NextResponse.json({ error: "No CSV text was provided" }, { status: 400 });
  if (csv.length > MAX_CSV_BYTES) {
    return NextResponse.json({ error: "That file is too large (200 KB max)" }, { status: 400 });
  }

  const plan = planTraineeImport(parseTraineeCsv(csv), await listTrainees(false));
  if (!body?.commit) return NextResponse.json({ plan });

  for (const t of plan.create) {
    await upsertTrainee({ firstName: t.firstName, lastName: t.lastName, ...(t.email ? { email: t.email } : {}) });
  }
  for (const t of plan.update) {
    await upsertTrainee({ id: t.id, firstName: t.firstName, lastName: t.lastName, email: t.email });
  }
  invalidateBootstrapCache();
  return NextResponse.json({ plan, applied: { created: plan.create.length, updated: plan.update.length } });
}
