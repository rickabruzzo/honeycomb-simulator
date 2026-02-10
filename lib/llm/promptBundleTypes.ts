/**
 * Versioned prompt bundle system for the simulator.
 *
 * A PromptBundle contains the core system prompt components that frame
 * every OpenAI conversation in the simulator. Bundles are versioned,
 * editable, and stored server-side to allow prompt iteration without code changes.
 */

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
  /** Conference details (name, themes) */
  conference: {
    name: string;
    themes: string;
  };

  /** Persona details (title, modifiers, emotional posture, etc.) */
  persona: {
    title: string;
    modifiers: string;
    emotionalPosture: string;
    toolingBias: string;
    otelFamiliarity: string;
  };

  /** Difficulty level (easy, medium, hard) */
  difficulty: string;

  /** Optional OpenAI enrichment result (adds contextual guidance) */
  enrichment?: {
    promptAddendum?: string;
  } | null;

  /** Current conversation state (ICEBREAKER, EXPLORATION, etc.) */
  sessionState: string;

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
