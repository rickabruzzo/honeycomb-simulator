import { NextRequest, NextResponse, after } from "next/server";
import { randomUUID } from "crypto";
import { createSessionWithEnrichment } from "@/lib/createSession";
import { saveSession } from "@/lib/storage";
import { saveInvite } from "@/lib/invites";
import { addInviteToIndex } from "@/lib/inviteIndex";
import { resolveTrainee, ensureTraineesSeeded } from "@/lib/traineeStore";
import { ensurePersonasSeeded } from "@/lib/personaStore";
import { getEnrichment } from "@/lib/llm/enrichmentStore";
import { ensureEnrichment } from "@/lib/llm/ensureEnrichment";
import { withSpan, withChildSpan } from "@/lib/telemetry";
import { useKv } from "@/lib/kvConfig";
import { batchWrite, withTiming } from "@/lib/batchOperations";

export async function POST(request: NextRequest) {
  return withSpan(
    "hc.event.invite_create",
    async (span) => {
      span.setAttribute("route", "/api/invite/create");
      span.setAttribute("method", "POST");
      span.setAttribute("event_type", "invite_create");
      span.setAttribute("invite_create.enrichment_mode", "async");

      let kvPipelineCalls = 0;

      try {
        const body = await request.json();

        // Validate required fields
        if (!body.traineeId || typeof body.traineeId !== "string") {
          span.setAttribute("status", 400);
          return NextResponse.json(
            { error: "traineeId is required" },
            { status: 400 }
          );
        }

        if (!body.personaId || typeof body.personaId !== "string") {
          span.setAttribute("status", 400);
          return NextResponse.json(
            { error: "personaId is required" },
            { status: 400 }
          );
        }

        span.setAttribute("persona_id", body.personaId);
        span.setAttribute("trainee_id", body.traineeId);

        // Ensure all stores are seeded (critical for in-memory dev mode)
        await Promise.all([
          ensurePersonasSeeded(),
          ensureTraineesSeeded(),
        ]);

        // Check enrichment cache synchronously (no generation)
        let enrichmentStatus: "pending" | "cached" = "pending";
        let enrichmentProvider = "mock";

        const cachedEnrichment = await withChildSpan(
          "hc.dep.kv.enrichment_check",
          async (childSpan) => {
            childSpan.setAttribute("dep_type", "kv");
            childSpan.setAttribute("operation", "get");

            if (!body.personaId) {
              childSpan.setAttribute("cache_hit", false);
              return null;
            }

            const cacheKey = `persona:${body.personaId}`;
            const result = await getEnrichment(cacheKey, body.personaId);
            childSpan.setAttribute("cache_hit", !!result);
            kvPipelineCalls++;
            return result;
          }
        );

        if (cachedEnrichment) {
          enrichmentStatus = "cached";
          enrichmentProvider = cachedEnrichment.provider || "mock";
        }

        span.setAttribute("invite_create.enrichment_status", enrichmentStatus);
        span.setAttribute("invite_create.enrichment_provider", enrichmentProvider);

        // Resolve trainee: exact match, normalized match, or auto-register from name
        const trainee = await resolveTrainee(body.traineeId, body.traineeName);
        if (!trainee) {
          span.setAttribute("status", 400);
          return NextResponse.json(
            { error: "Trainee not found and no traineeName provided" },
            { status: 400 }
          );
        }

        // Use the resolved trainee's canonical ID for all downstream operations
        const resolvedTraineeId = trainee.id;

        // Create session WITHOUT waiting for enrichment generation
        // skipEnrichmentGeneration=true means only check cache, don't generate
        const result = await createSessionWithEnrichment({
          personaId: body.personaId,
          attendeeProfile: body.attendeeProfile,
          traineeId: resolvedTraineeId,
          skipEnrichmentGeneration: true, // KEY: Don't block on OpenAI
        });

        if (result.error) {
          span.setAttribute("status", 400);
          span.setAttribute("error", result.error);
          return NextResponse.json({ error: result.error }, { status: 400 });
        }

        const session = result.session;
        // Training-wheels (guided) mode — persisted on the session so scoring + the trainee
        // view can honor it.
        const trainingWheels = Boolean(body.trainingWheels);
        session.trainingWheels = trainingWheels;
        const token = randomUUID();
        const createdAt = new Date().toISOString();

        // Extract snapshot data from session kickoff
        const invite = {
          token,
          sessionId: session.id,
          createdAt,
          personaId: body.personaId,
          traineeId: resolvedTraineeId,
          traineeName: body.traineeName || `${trainee.firstName} ${trainee.lastName}`,
          createdBy: body.createdBy,
          trainingWheels,
          // Snapshot fields from session
          personaDisplayName: session.kickoff.personaDisplayName,
          traineeNameShort: session.kickoff.traineeNameShort,
        };

        // Batch write: session + invite + index in single pipeline (if KV)
        const { duration: writeDuration } = await withTiming(async () => {
          return withChildSpan(
            "hc.dep.kv.write",
            async (childSpan) => {
              childSpan.setAttribute("dep_type", "kv");
              childSpan.setAttribute("operation", "batch_write");

              if (useKv()) {
                // Batch all writes into single pipeline
                await batchWrite([
                  { key: `session:${session.id}`, value: session },
                  { key: `invite:${token}`, value: invite },
                  { key: `invite_index:${token}`, value: createdAt },
                ]);
                childSpan.setAttribute("operations_count", 3);
                kvPipelineCalls++;
              } else {
                // In-memory mode: call individual functions
                await saveSession(session);
                await saveInvite(invite);
                await addInviteToIndex(token, createdAt);
                childSpan.setAttribute("operations_count", 3);
              }
            }
          );
        });

        span.setAttribute("invite_create.kv_write_duration_ms", writeDuration);
        span.setAttribute("invite_create.kv_pipeline_calls", kvPipelineCalls);

        // Generate enrichment in the background if it wasn't already cached. Runs via after()
        // so Vercel keeps the function alive until it finishes — the previous un-awaited
        // self-fetch was frequently frozen before the request left the box, so enrichment
        // never got cached. Generating in-process here also drops the extra HTTP round-trip.
        if (enrichmentStatus === "pending" && body.personaId) {
          const personaId = body.personaId;
          const attendeeProfile = session.kickoff.attendeeProfile;
          after(async () => {
            try {
              const res = await ensureEnrichment({
                conferenceId: `persona:${personaId}`, // synthetic cache key
                personaId,
                conferenceContext: "Tech conference booth",
                attendeeProfile,
              });
              if (res.status === "pending") {
                console.warn(
                  `[invite/create] background enrichment did not complete: ${res.error ?? "unknown"}`
                );
              }
            } catch (err) {
              console.error("[invite/create] background enrichment failed:", err);
            }
          });

          span.setAttribute("invite_create.enrichment_triggered", true);
        } else {
          span.setAttribute("invite_create.enrichment_triggered", false);
        }

        span.setAttribute("status", 200);
        span.setAttribute("session_id", session.id);
        span.setAttribute("invite_token", token);

        return NextResponse.json({
          token,
          sessionId: session.id,
          url: `/s/${token}`,
          enrichment: {
            provider: enrichmentProvider,
            status: enrichmentStatus,
          },
        });
      } catch (error) {
        console.error("[invite/create] Error:", error);
        span.setAttribute("status", 500);
        span.setAttribute("error", error instanceof Error ? error.message : "Unknown error");

        return NextResponse.json(
          { error: "Failed to create invite" },
          { status: 500 }
        );
      }
    },
    { route: "/api/invite/create", method: "POST", event_type: "invite_create" }
  );
}
