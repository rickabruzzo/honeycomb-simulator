import { NextResponse } from "next/server";
import { listConferences, ensureConferencesSeeded } from "@/lib/conferenceStore";
import { listPersonas, ensurePersonasSeeded } from "@/lib/personaStore";
import { listTrainees } from "@/lib/traineeStore";
import type { Conference, Persona } from "@/lib/scenarioTypes";
import type { Trainee } from "@/lib/traineeStore";

interface BootstrapData {
  conferences: Conference[];
  personas: Persona[];
  trainees: Trainee[];
  _meta: {
    loadTimeMs: number;
    generatedAt: string;
    cached?: boolean;
  };
}

// In-memory cache for development (30 second TTL)
let bootstrapCache: { data: BootstrapData; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30_000; // 30 seconds

/**
 * Bootstrap endpoint - returns all initial data in one request
 * Reduces client round trips from 3 to 1
 * In-memory cache prevents repeated KV reads during dev
 */
export async function GET() {
  const t0 = Date.now();

  try {
    // Check cache first (only in development)
    const isDev = process.env.NODE_ENV === "development";
    if (isDev && bootstrapCache && bootstrapCache.expiresAt > Date.now()) {
      const elapsed = Date.now() - t0;
      console.log(`[Bootstrap] Returning cached data (${elapsed}ms)`);
      return NextResponse.json({
        ...bootstrapCache.data,
        _meta: {
          ...bootstrapCache.data._meta,
          cached: true,
        },
      });
    }
    // Seed data if needed (only runs once per store)
    const tSeedStart = Date.now();
    await Promise.all([
      ensureConferencesSeeded(),
      ensurePersonasSeeded(),
    ]);
    const tSeedEnd = Date.now();
    console.log(`[Bootstrap] Seeding took ${tSeedEnd - tSeedStart}ms`);

    // Fetch all data in parallel with individual timing
    const tConfStart = Date.now();
    const conferencesPromise = listConferences(false);

    const tPersonaStart = Date.now();
    const personasPromise = listPersonas(false);

    const tTraineeStart = Date.now();
    const traineesPromise = listTrainees();

    const [conferences, personas, trainees] = await Promise.all([
      conferencesPromise,
      personasPromise,
      traineesPromise,
    ]);

    const tConfEnd = Date.now();
    const tPersonaEnd = Date.now();
    const tTraineeEnd = Date.now();

    console.log(`[Bootstrap] Conferences: ${tConfEnd - tConfStart}ms`);
    console.log(`[Bootstrap] Personas: ${tPersonaEnd - tPersonaStart}ms`);
    console.log(`[Bootstrap] Trainees: ${tTraineeEnd - tTraineeStart}ms`);

    const elapsed = Date.now() - t0;
    console.log(`[Bootstrap] Total: ${elapsed}ms (${conferences.length} conferences, ${personas.length} personas, ${trainees.length} trainees)`);

    const responseData: BootstrapData = {
      conferences,
      personas,
      trainees,
      _meta: {
        loadTimeMs: elapsed,
        generatedAt: new Date().toISOString(),
      },
    };

    // Cache for dev
    if (isDev) {
      bootstrapCache = {
        data: responseData,
        expiresAt: Date.now() + CACHE_TTL_MS,
      };
    }

    return NextResponse.json(responseData);
  } catch (error) {
    const elapsed = Date.now() - t0;
    console.error(`[Bootstrap] Failed after ${elapsed}ms:`, error);
    return NextResponse.json(
      { error: "Failed to load bootstrap data" },
      { status: 500 }
    );
  }
}
