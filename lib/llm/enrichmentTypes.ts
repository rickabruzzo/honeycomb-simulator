/**
 * Enrichment result structure for LLM-enhanced attendee behavior
 */
export interface EnrichmentResult {
  version: string;
  generatedAt: string;
  conferenceId: string;
  personaId: string;
  traineeId?: string | null;
  provider?: "openai" | "mock"; // Which provider generated this enrichment
  attendeeStyleGuide: {
    tone: string;
    brevity: "short" | "medium";
    skepticism: "low" | "medium" | "high";
    ventingTriggers: string[];
  };
  domainContext: {
    themes: string[];
    typicalTopics: string[];
  };
  personaBehavior: {
    revealWhenEarned: string[];
    resistIfPitched: string[];
    objections: string[];
  };
  vocabHints: {
    mirrorTerms: string[];
    avoidTerms: string[];
  };
  promptAddendum: string; // plain-language append-only
}

/**
 * Input for enrichment generation
 */
export interface EnrichmentInput {
  conferenceId: string;
  personaId: string;
  traineeId?: string | null;
  conferenceContext: string; // Full conference context text
  attendeeProfile: string; // Full attendee profile text
}
