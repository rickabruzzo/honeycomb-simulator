import { getEnrichment, saveEnrichment } from "./enrichmentStore";
import { getEnrichmentProvider } from "./provider";
import type { EnrichmentInput, EnrichmentResult } from "./enrichmentTypes";

export type EnsureEnrichmentStatus = "cached" | "fresh" | "pending";

export interface EnsureEnrichmentResult {
  status: EnsureEnrichmentStatus;
  provider?: string;
  error?: string;
  /** The enrichment itself when status is "cached" or "fresh", so callers needn't re-read cache. */
  enrichment?: EnrichmentResult;
}

/**
 * Generation timeout. Generous because this runs as post-response background work (via
 * `after()`), not on any request's hot path — its only job is to bound a hung provider call
 * so it can't hold the function open for the full platform limit. gpt-4o-mini normally
 * returns in 1-3s; the old 8s ceiling was tight only because it was also racing a cold
 * self-fetch round-trip, which this path removes.
 */
const ENRICHMENT_TIMEOUT_MS = Number(process.env.ENRICHMENT_TIMEOUT_MS ?? 20000);

/**
 * Ensure enrichment exists for a persona: return the cached copy if present, otherwise
 * generate it, save it, and return "fresh". Never throws — a generation failure or timeout
 * resolves to "pending" so the caller (and the attendee) simply falls back to the base
 * persona, which drives a full in-character attendee on its own.
 *
 * This is the single source of truth for enrichment generation, shared by the invite-create
 * background task and the /api/enrichment/ensure endpoint, so the timeout, cache key, and
 * save behavior can't drift between them.
 */
export async function ensureEnrichment(
  input: EnrichmentInput
): Promise<EnsureEnrichmentResult> {
  const cacheKey = input.conferenceId; // callers pass the synthetic `persona:<id>` key

  const cached = await getEnrichment(cacheKey, input.personaId);
  if (cached) return { status: "cached", provider: cached.provider, enrichment: cached };

  if (!input.conferenceContext || !input.attendeeProfile) {
    return { status: "pending", error: "missing context for generation" };
  }

  const provider = getEnrichmentProvider();

  const timeout = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), ENRICHMENT_TIMEOUT_MS)
  );

  let enrichment: EnrichmentResult | null = null;
  try {
    enrichment = await Promise.race([provider.enrich(input), timeout]);
  } catch (error) {
    console.error("[ensureEnrichment] generation failed:", error);
    return {
      status: "pending",
      error: error instanceof Error ? error.message : "unknown error",
    };
  }

  if (!enrichment) return { status: "pending", error: "generation timed out" };

  await saveEnrichment(enrichment);
  return { status: "fresh", provider: enrichment.provider, enrichment };
}
