import { after } from "next/server";
import { createSessionWithEnrichment } from "./createSession";
import { saveSession } from "./storage";
import { getInvite, saveInvite } from "./invites";
import { addInviteToIndex } from "./inviteIndex";
import { resolveTrainee, ensureTraineesSeeded } from "./traineeStore";
import { ensurePersonasSeeded } from "./personaStore";
import { getEnrichment } from "./llm/enrichmentStore";
import { ensureEnrichment } from "./llm/ensureEnrichment";
import { withSpan, withChildSpan } from "./telemetry";
import { useKv } from "./kvConfig";
import { batchWrite, withTiming } from "./batchOperations";
import { uniqueToken } from "./readableToken";

/**
 * Create a practice link: a session + an invite + a Scenario Tracker row, with persona
 * enrichment generated in the background when it isn't cached yet. Shared by the Builder's
 * POST /api/invite/create and the self-serve /api/start flow, so both make identical invites.
 */

export interface CreateInviteInput {
  personaId: string;
  traineeId: string;
  /** Lets an unknown traineeId auto-register (Builder flow). */
  traineeName?: string;
  trainingWheels?: boolean;
  createdBy?: string;
  attendeeProfile?: string;
}

export type CreateInviteResult =
  | {
      ok: true;
      token: string;
      sessionId: string;
      url: string;
      enrichment: { provider: string; status: "pending" | "cached" };
    }
  | { ok: false; status: 400; error: string };

export interface CreateInviteOptions {
  /**
   * Schedules post-response work. Defaults to Next's after() (Vercel keeps the function alive
   * until it finishes). Tests pass a no-op: after() throws outside a request scope.
   */
  runAfter?: (fn: () => Promise<void>) => void;
}

export async function createInvite(
  input: CreateInviteInput,
  opts: CreateInviteOptions = {}
): Promise<CreateInviteResult> {
  const runAfter = opts.runAfter ?? after;
  return withSpan(
    "hc.event.invite_create",
    async (span) => {
      span.setAttribute("route", "/api/invite/create");
      span.setAttribute("method", "POST");
      span.setAttribute("event_type", "invite_create");
      span.setAttribute("invite_create.enrichment_mode", "async");
      span.setAttribute("persona_id", input.personaId);
      span.setAttribute("trainee_id", input.traineeId);
      if (input.createdBy) span.setAttribute("invite_create.created_by", input.createdBy);

      let kvPipelineCalls = 0;

      // Ensure all stores are seeded (critical for in-memory dev mode)
      await Promise.all([ensurePersonasSeeded(), ensureTraineesSeeded()]);

      // Check enrichment cache synchronously (no generation)
      let enrichmentStatus: "pending" | "cached" = "pending";
      let enrichmentProvider = "mock";

      const cachedEnrichment = await withChildSpan(
        "hc.dep.kv.enrichment_check",
        async (childSpan) => {
          childSpan.setAttribute("dep_type", "kv");
          childSpan.setAttribute("operation", "get");
          const cacheKey = `persona:${input.personaId}`;
          const result = await getEnrichment(cacheKey, input.personaId);
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
      const trainee = await resolveTrainee(input.traineeId, input.traineeName);
      if (!trainee) {
        span.setAttribute("status", 400);
        return { ok: false, status: 400, error: "Trainee not found and no traineeName provided" };
      }

      // Use the resolved trainee's canonical ID for all downstream operations
      const resolvedTraineeId = trainee.id;
      const traineeName = input.traineeName || `${trainee.firstName} ${trainee.lastName}`;

      // Create session WITHOUT waiting for enrichment generation
      // skipEnrichmentGeneration=true means only check cache, don't generate
      const result = await createSessionWithEnrichment({
        personaId: input.personaId,
        attendeeProfile: input.attendeeProfile,
        traineeId: resolvedTraineeId,
        skipEnrichmentGeneration: true, // KEY: Don't block on the LLM
      });

      if (result.error) {
        span.setAttribute("status", 400);
        span.setAttribute("error", result.error);
        return { ok: false, status: 400, error: result.error };
      }

      const session = result.session;
      // Training-wheels (guided) mode — persisted on the session so scoring + the trainee
      // view can honor it.
      const trainingWheels = Boolean(input.trainingWheels);
      session.trainingWheels = trainingWheels;
      // Readable: /s/rick-abruzzo-7f3a. Lookups are by key, so older UUID links still work.
      const token = await uniqueToken(traineeName, async (t) => Boolean(await getInvite(t)));
      const createdAt = new Date().toISOString();

      // Extract snapshot data from session kickoff
      const invite = {
        token,
        sessionId: session.id,
        createdAt,
        personaId: input.personaId,
        traineeId: resolvedTraineeId,
        traineeName,
        createdBy: input.createdBy,
        trainingWheels,
        // Snapshot fields from session
        personaDisplayName: session.kickoff.personaDisplayName,
        traineeNameShort: session.kickoff.traineeNameShort,
      };

      // Batch write: session + invite + index in single pipeline (if KV)
      const { duration: writeDuration } = await withTiming(async () => {
        return withChildSpan("hc.dep.kv.write", async (childSpan) => {
          childSpan.setAttribute("dep_type", "kv");
          childSpan.setAttribute("operation", "batch_write");

          if (useKv()) {
            // Batch the session + invite writes into one pipeline...
            await batchWrite([
              { key: `session:${session.id}`, value: session },
              { key: `invite:${token}`, value: invite },
              // Reverse mapping (what saveInvite writes in memory mode). Without it,
              // getInviteForSession can't resolve the invite from a session on KV.
              { key: `session_invite:${session.id}`, value: { token } },
            ]);
            // ...then update the shared `invites:index` array the Scenario Tracker reads.
            await addInviteToIndex(token, createdAt);
            childSpan.setAttribute("operations_count", 4);
            kvPipelineCalls++;
          } else {
            // In-memory mode: call individual functions
            await saveSession(session);
            await saveInvite(invite);
            await addInviteToIndex(token, createdAt);
            childSpan.setAttribute("operations_count", 3);
          }
        });
      });

      span.setAttribute("invite_create.kv_write_duration_ms", writeDuration);
      span.setAttribute("invite_create.kv_pipeline_calls", kvPipelineCalls);

      // Generate enrichment in the background if it wasn't already cached. Runs via after()
      // so Vercel keeps the function alive until it finishes — an un-awaited self-fetch was
      // frequently frozen before the request left the box, so enrichment never got cached.
      if (enrichmentStatus === "pending") {
        const personaId = input.personaId;
        const attendeeProfile = session.kickoff.attendeeProfile;
        runAfter(async () => {
          try {
            const res = await ensureEnrichment({
              conferenceId: `persona:${personaId}`, // synthetic cache key
              personaId,
              conferenceContext: "Tech conference booth",
              attendeeProfile,
            });
            if (res.status === "pending") {
              console.warn(
                `[createInvite] background enrichment did not complete: ${res.error ?? "unknown"}`
              );
            }
          } catch (err) {
            console.error("[createInvite] background enrichment failed:", err);
          }
        });
        span.setAttribute("invite_create.enrichment_triggered", true);
      } else {
        span.setAttribute("invite_create.enrichment_triggered", false);
      }

      span.setAttribute("status", 200);
      span.setAttribute("session_id", session.id);
      span.setAttribute("invite_token", token);

      return {
        ok: true,
        token,
        sessionId: session.id,
        url: `/s/${token}`,
        enrichment: { provider: enrichmentProvider, status: enrichmentStatus },
      };
    },
    { route: "/api/invite/create", method: "POST", event_type: "invite_create" }
  );
}
