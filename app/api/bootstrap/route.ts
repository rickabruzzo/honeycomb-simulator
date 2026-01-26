import { NextResponse } from "next/server";
import { listConferences, ensureConferencesSeeded } from "@/lib/conferenceStore";
import { listPersonas, ensurePersonasSeeded } from "@/lib/personaStore";
import { listTrainees } from "@/lib/traineeStore";

/**
 * Bootstrap endpoint - returns all initial data in one request
 * Reduces client round trips from 3 to 1
 */
export async function GET() {
  const t0 = Date.now();

  try {
    // Seed data if needed (only runs once per store)
    await Promise.all([
      ensureConferencesSeeded(),
      ensurePersonasSeeded(),
    ]);

    // Fetch all data in parallel
    const [conferences, personas, trainees] = await Promise.all([
      listConferences(false), // Exclude archived
      listPersonas(false), // Exclude archived
      listTrainees(),
    ]);

    const elapsed = Date.now() - t0;
    console.log(`[Bootstrap] Loaded ${conferences.length} conferences, ${personas.length} personas, ${trainees.length} trainees in ${elapsed}ms`);

    return NextResponse.json({
      conferences,
      personas,
      trainees,
      _meta: {
        loadTimeMs: elapsed,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    const elapsed = Date.now() - t0;
    console.error(`[Bootstrap] Failed after ${elapsed}ms:`, error);
    return NextResponse.json(
      { error: "Failed to load bootstrap data" },
      { status: 500 }
    );
  }
}
