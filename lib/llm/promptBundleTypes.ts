/**
 * Versioned prompt bundle system for the simulator.
 *
 * A PromptBundle contains the core system prompt components that frame
 * every OpenAI conversation in the simulator. Bundles are versioned,
 * editable, and stored server-side to allow prompt iteration without code changes.
 */

import type { EnrichmentResult } from "./enrichmentTypes";

export interface PromptBundle {
  /** Unique identifier (e.g., 'default', 'v1', 'v2-experimental') */
  id: string;

  /** Semantic version (e.g., 'v1.0.0', 'v2.1.3') */
  version: string;

  /** ISO timestamp of last update */
  updatedAt: string;

  /**
   * Facilitator setup text - instructions for the AI on how to facilitate
   * roleplay conversations as a booth attendee. This sets the tone and
   * overall behavior framework.
   */
  facilitatorSetup: string;

  /**
   * Master system prompt - core instructions that apply across all
   * conversation states. Includes critical rules, behavioral guidelines,
   * and response style instructions.
   */
  masterSystemPrompt: string;

  /**
   * Optional post-session rubric - scoring guidelines or evaluation
   * criteria for assessing trainee performance (future use).
   */
  postSessionRubric?: string;

  /**
   * Optional notes - internal documentation about changes, experiments,
   * or rationale for this bundle version.
   */
  notes?: string;
}

/**
 * Runtime context passed to prompt composition.
 *
 * This is NOT stored with the bundle - it's provided at message generation
 * time and includes scenario-specific details and dynamic state.
 */
export interface PromptRuntimeContext {
  /** Persona details (title, modifiers, emotional posture, etc.) */
  persona: {
    title: string;
    modifiers: string;
    emotionalPosture: string;
    toolingBias: string;
    otelFamiliarity: string;
    /**
     * Character brief and the attendee's private pain inventory, in plain language.
     *
     * These come from lib/personas/canonicalPersonas.ts, which encodes the PMM persona
     * research. Before this existed, none of it reached the prompt - the attendee model only
     * ever saw title/modifiers/posture/tooling/otel, which is why a DevOps Engineer and a
     * Technical Decision-Maker returned byte-identical pain text. Their differentiating
     * material existed and was never shown to the model.
     */
    behaviorBrief?: string;
    /** True for buyer-type personas (director, VP, TDM) who do not control hands-on work. */
    isBuyer?: boolean;
    /** Plain-language pains, most central first. Private until a question earns them. */
    painPoints?: string[];
  };

  /**
   * Optional enrichment result (adds contextual guidance).
   *
   * This was previously narrowed to just promptAddendum, which is why the rest of the
   * enrichment payload was generated on every session, stored, and then discarded -
   * ventingTriggers, resistIfPitched, revealWhenEarned, and the vocab hints are all
   * per-persona behavioral data the composer now uses.
   */
  enrichment?: Partial<EnrichmentResult> | null;

  /** Current conversation state (ICEBREAKER, EXPLORATION, etc.) */
  sessionState: string;

  /**
   * Earned-trust band from the momentum model (GUARDED..COMMITTED).
   *
   * Drives the reveal budget: how open the attendee is, and whether a war story is reachable.
   * Optional so older callers still compose; absent means treat as GUARDED (earn it first).
   */
  momentumBand?: string;

  /**
   * Optional trainer feedback/guidance - injected into system prompt
   * when a trainer provides specific instructions or adjustments
   * for this session.
   */
  trainerGuidance?: string | null;

  /**
   * Turn limit exceeded flag - signals attendee to converge toward outcome
   */
  turnLimitExceeded?: boolean;

  /**
   * Self-service cues detected - signals attendee may prefer async/self-guided path
   */
  selfServiceCuesDetected?: boolean;

  /**
   * MQL cues detected - signals attendee wants follow-up with sales/leadership (HOT LEAD)
   */
  mqlCuesDetected?: boolean;

  /**
   * Deferred interest cues detected - signals attendee is interested but timing isn't right
   */
  deferredInterestCuesDetected?: boolean;

  /**
   * Stakeholder type - executive, IC without authority, or unknown
   */
  stakeholderType?: string;
}

/**
 * Composed system prompt result.
 *
 * This is what gets passed to OpenAI's messages API as the system message.
 */
export interface ComposedSystemPrompt {
  /** The full system prompt text */
  content: string;

  /** Bundle version used for composition */
  bundleVersion: string;

  /** Timestamp of composition */
  composedAt: string;

  /** Whether trainer guidance was included */
  hasTrainerGuidance: boolean;
}
