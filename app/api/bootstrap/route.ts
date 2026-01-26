import { NextResponse } from "next/server";
import { listConferences, ensureConferencesSeeded } from "@/lib/conferenceStore";
import { listPersonas, ensurePersonasSeeded } from "@/lib/personaStore";
import { listTrainees, ensureTraineesSeeded } from "@/lib/traineeStore";
import type { Conference, Persona } from "@/lib/scenarioTypes";
import type { Trainee } from "@/lib/traineeStore";
import { withSpan } from "@/lib/telemetry";

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
  return withSpan(
    "hc.event.bootstrap",
    async (span) => {
      const t0 = Date.now();

      span.setAttribute("route", "/api/bootstrap");
      span.setAttribute("method", "GET");
      span.setAttribute("event_type", "bootstrap");

      try {
        // Check cache first (only in development)
        const isDev = process.env.NODE_ENV === "development";

        // Cache validation: ensure cache has reasonable data before using it
        const isCacheValid = bootstrapCache &&
          bootstrapCache.expiresAt > Date.now() &&
          bootstrapCache.data.conferences.length > 0 &&
          bootstrapCache.data.personas.length >= 6; // We expect 6 scenario personas

        if (isDev && isCacheValid && bootstrapCache) {
          const elapsed = Date.now() - t0;
          console.log(`[Bootstrap] Returning cached data (${elapsed}ms)`);

          span.setAttribute("cache_hit", true);
          span.setAttribute("status", 200);

          return NextResponse.json({
            ...bootstrapCache.data,
            _meta: {
              ...bootstrapCache.data._meta,
              cached: true,
            },
          });
        }

        if (isDev && bootstrapCache && !isCacheValid) {
          console.log("[Bootstrap] Cache invalidated (insufficient data)");
        }

        span.setAttribute("cache_hit", false);

        // Seed data if needed (only runs once per store)
        const tSeedStart = Date.now();
        await Promise.all([
          ensureConferencesSeeded(),
          ensurePersonasSeeded(),
          ensureTraineesSeeded(),
        ]);
        const tSeedEnd = Date.now();
        const seedDuration = tSeedEnd - tSeedStart;
        console.log(`[Bootstrap] Seeding took ${seedDuration}ms`);
        span.setAttribute("seed_duration_ms", seedDuration);

        // Fetch all data in parallel with individual timing
        const tConfStart = Date.now();
        const tPersonaStart = Date.now();
        const tTraineeStart = Date.now();

        const [conferences, personas, trainees] = await Promise.all([
          listConferences(false),
          listPersonas(false),
          listTrainees(),
        ]);

        const tConfEnd = Date.now();
        const tPersonaEnd = Date.now();
        const tTraineeEnd = Date.now();

        const confDuration = tConfEnd - tConfStart;
        const personaDuration = tPersonaEnd - tPersonaStart;
        const traineeDuration = tTraineeEnd - tTraineeStart;

        console.log(`[Bootstrap] Conferences: ${confDuration}ms (${conferences.length} items) - IDs: ${conferences.map(c => c.id).slice(0, 3).join(', ')}`);
        console.log(`[Bootstrap] Personas: ${personaDuration}ms (${personas.length} items) - IDs: ${personas.map(p => p.id).slice(0, 3).join(', ')}`);
        console.log(`[Bootstrap] Trainees: ${traineeDuration}ms (${trainees.length} items)`);

        span.setAttribute("conferences_count", conferences.length);
        span.setAttribute("personas_count", personas.length);
        span.setAttribute("trainees_count", trainees.length);
        span.setAttribute("conferences_load_ms", confDuration);
        span.setAttribute("personas_load_ms", personaDuration);
        span.setAttribute("trainees_load_ms", traineeDuration);

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

        span.setAttribute("status", 200);
        return NextResponse.json(responseData);
      } catch (error) {
        const elapsed = Date.now() - t0;
        console.error(`[Bootstrap] Failed after ${elapsed}ms:`, error);

        span.setAttribute("status", 500);
        span.setAttribute("error_message", error instanceof Error ? error.message : "Unknown error");

        return NextResponse.json(
          { error: "Failed to load bootstrap data" },
          { status: 500 }
        );
      }
    },
    { route: "/api/bootstrap", method: "GET", event_type: "bootstrap" }
  );
}
