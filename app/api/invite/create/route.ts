import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createSessionWithEnrichment } from "@/lib/createSession";
import { saveSession } from "@/lib/storage";
import { saveInvite } from "@/lib/invites";
import { addInviteToIndex } from "@/lib/inviteIndex";
import { getTrainee, ensureTraineesSeeded } from "@/lib/traineeStore";
import { ensurePersonasSeeded } from "@/lib/personaStore";
import { getEnrichment } from "@/lib/llm/enrichmentStore";
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

        // Verify trainee exists
        const trainee = await getTrainee(body.traineeId);
        if (!trainee) {
          span.setAttribute("status", 400);
          return NextResponse.json(
            { error: "Trainee not found" },
            { status: 400 }
          );
        }

        // Create session WITHOUT waiting for enrichment generation
        // skipEnrichmentGeneration=true means only check cache, don't generate
        const result = await createSessionWithEnrichment({
          personaId: body.personaId,
          attendeeProfile: body.attendeeProfile,
          traineeId: body.traineeId,
          skipEnrichmentGeneration: true, // KEY: Don't block on OpenAI
        });

        if (result.error) {
          span.setAttribute("status", 400);
          span.setAttribute("error", result.error);
          return NextResponse.json({ error: result.error }, { status: 400 });
        }

        const session = result.session;
        const token = randomUUID();
        const createdAt = new Date().toISOString();

        // Extract snapshot data from session kickoff
        const invite = {
          token,
          sessionId: session.id,
          createdAt,
          personaId: body.personaId,
          traineeId: body.traineeId,
          traineeName: body.traineeName || `${trainee.firstName} ${trainee.lastName}`,
          createdBy: body.createdBy,
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

        // Trigger background enrichment if not cached
        if (enrichmentStatus === "pending" && body.personaId) {
          // Fire-and-forget request to ensure endpoint
          const enrichmentUrl = new URL(
            "/api/enrichment/ensure",
            request.url
          ).toString();

          // Don't await - let it run in background
          fetch(enrichmentUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              conferenceId: `persona:${body.personaId}`, // Synthetic key
              personaId: body.personaId,
              conferenceContext: "Tech conference booth",
              attendeeProfile: session.kickoff.attendeeProfile,
            }),
          }).catch((err) => {
            // Log but don't fail
            console.error("[invite/create] Background enrichment trigger failed:", err);
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
