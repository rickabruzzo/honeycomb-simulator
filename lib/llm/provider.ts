import type { EnrichmentInput, EnrichmentResult } from "./enrichmentTypes";

/**
 * Provider interface for enrichment generation
 */
export interface EnrichmentProvider {
  enrich(input: EnrichmentInput): Promise<EnrichmentResult>;
}

/**
 * Mock enrichment provider that deterministically derives enrichment
 * from conference themes, persona job title, modifiers, and OTel familiarity
 */
export class MockEnrichmentProvider implements EnrichmentProvider {
  async enrich(input: EnrichmentInput): Promise<EnrichmentResult> {
    // Parse conference themes
    const themeMatch = input.conferenceContext.match(/Themes: ([^\n]+)/);
    const themes = themeMatch
      ? themeMatch[1].split(",").map((t) => t.trim())
      : [];

    // Parse persona fields
    const personaTypeMatch = input.attendeeProfile.match(/Persona: ([^\n]+)/);
    const personaType = personaTypeMatch ? personaTypeMatch[1].trim() : "";

    const modifiersMatch = input.attendeeProfile.match(/Modifiers: ([^\n]+)/);
    const modifiers = modifiersMatch
      ? modifiersMatch[1].split(";").map((m) => m.trim())
      : [];

    const emotionalMatch = input.attendeeProfile.match(
      /Emotional posture: ([^\n]+)/
    );
    const emotionalPosture = emotionalMatch ? emotionalMatch[1].trim() : "";

    const otelMatch = input.attendeeProfile.match(
      /OpenTelemetry familiarity: ([^\n]+)/
    );
    const otelFamiliarity = otelMatch ? otelMatch[1].trim().toLowerCase() : "";

    // Derive tone from emotional posture
    const tone = this.deriveTone(emotionalPosture);

    // Derive brevity from persona type and modifiers
    const brevity = this.deriveBrevity(personaType, modifiers);

    // Derive skepticism from OTel familiarity and modifiers
    const skepticism = this.deriveSkepticism(otelFamiliarity, modifiers);

    // Derive venting triggers from themes and modifiers
    const ventingTriggers = this.deriveVentingTriggers(themes, modifiers);

    // Build domain context
    const domainContext = {
      themes,
      typicalTopics: this.deriveTypicalTopics(themes, personaType),
    };

    // Build persona behavior
    const personaBehavior = {
      revealWhenEarned: this.deriveRevealWhenEarned(
        personaType,
        otelFamiliarity
      ),
      resistIfPitched: this.deriveResistIfPitched(modifiers),
      objections: this.deriveObjections(otelFamiliarity, modifiers),
    };

    // Build vocab hints
    const vocabHints = {
      mirrorTerms: this.deriveMirrorTerms(themes, personaType),
      avoidTerms: this.deriveAvoidTerms(otelFamiliarity),
    };

    // Build prompt addendum
    const promptAddendum = this.buildPromptAddendum(
      tone,
      brevity,
      skepticism,
      ventingTriggers,
      personaBehavior
    );

    return {
      version: "1.0",
      generatedAt: new Date().toISOString(),
      conferenceId: input.conferenceId,
      personaId: input.personaId,
      traineeId: input.traineeId,
      attendeeStyleGuide: {
        tone,
        brevity,
        skepticism,
        ventingTriggers,
      },
      domainContext,
      personaBehavior,
      vocabHints,
      promptAddendum,
    };
  }

  private deriveTone(emotionalPosture: string): string {
    const lower = emotionalPosture.toLowerCase();
    if (lower.includes("guarded") || lower.includes("skeptical")) {
      return "reserved, cautious";
    }
    if (lower.includes("friendly") || lower.includes("open")) {
      return "warm, conversational";
    }
    if (lower.includes("frustrated") || lower.includes("stressed")) {
      return "tense, weary";
    }
    return "professional, measured";
  }

  private deriveBrevity(
    personaType: string,
    modifiers: string[]
  ): "short" | "medium" {
    const lower = personaType.toLowerCase();
    const modLower = modifiers.join(" ").toLowerCase();

    // Senior ICs and busy people tend to be brief
    if (
      lower.includes("senior") ||
      lower.includes("director") ||
      modLower.includes("busy") ||
      modLower.includes("impatient")
    ) {
      return "short";
    }
    return "medium";
  }

  private deriveSkepticism(
    otelFamiliarity: string,
    modifiers: string[]
  ): "low" | "medium" | "high" {
    const modLower = modifiers.join(" ").toLowerCase();

    // High skepticism for those with strong existing tooling
    if (
      modLower.includes("attached to current tools") ||
      modLower.includes("skeptical")
    ) {
      return "high";
    }

    // Low skepticism for those actively using OTel
    if (otelFamiliarity.includes("active") || otelFamiliarity.includes("starting")) {
      return "low";
    }

    // Medium for those aware or considering
    if (otelFamiliarity.includes("aware") || otelFamiliarity.includes("considering")) {
      return "medium";
    }

    // High for those who never heard of it
    return "high";
  }

  private deriveVentingTriggers(
    themes: string[],
    modifiers: string[]
  ): string[] {
    const triggers: string[] = [];

    // Common pain points from themes
    if (themes.some((t) => t.toLowerCase().includes("incident"))) {
      triggers.push("recent production incidents");
    }
    if (themes.some((t) => t.toLowerCase().includes("toil"))) {
      triggers.push("manual work and toil");
    }
    if (themes.some((t) => t.toLowerCase().includes("scale"))) {
      triggers.push("scaling challenges");
    }

    // Persona-specific triggers
    const modLower = modifiers.join(" ").toLowerCase();
    if (modLower.includes("frustrated")) {
      triggers.push("lack of visibility");
    }
    if (modLower.includes("stressed")) {
      triggers.push("time pressure");
    }

    return triggers;
  }

  private deriveTypicalTopics(themes: string[], personaType: string): string[] {
    const topics: string[] = [...themes];

    // Add role-specific topics
    const lower = personaType.toLowerCase();
    if (lower.includes("sre") || lower.includes("reliability")) {
      topics.push("SLOs", "on-call rotation", "incident response");
    }
    if (lower.includes("platform") || lower.includes("infrastructure")) {
      topics.push("developer experience", "self-service");
    }
    if (lower.includes("security")) {
      topics.push("compliance", "audit logs");
    }

    return topics;
  }

  private deriveRevealWhenEarned(
    personaType: string,
    otelFamiliarity: string
  ): string[] {
    const reveals: string[] = [
      "current pain points",
      "budget constraints",
      "team priorities",
    ];

    // Only reveal deep technical details if they're familiar
    if (
      otelFamiliarity.includes("active") ||
      otelFamiliarity.includes("starting")
    ) {
      reveals.push("current observability stack details");
    }

    return reveals;
  }

  private deriveResistIfPitched(modifiers: string[]): string[] {
    const resistance: string[] = [
      "direct sales pitches",
      "feature lists without context",
    ];

    const modLower = modifiers.join(" ").toLowerCase();
    if (modLower.includes("skeptical") || modLower.includes("guarded")) {
      resistance.push("claims without evidence");
      resistance.push("vendor promises");
    }

    return resistance;
  }

  private deriveObjections(
    otelFamiliarity: string,
    modifiers: string[]
  ): string[] {
    const objections: string[] = [];

    // Objections based on OTel familiarity
    if (otelFamiliarity.includes("never")) {
      objections.push("never heard of OpenTelemetry");
      objections.push("sounds complicated");
    }

    if (otelFamiliarity.includes("aware")) {
      objections.push("not sure if it's worth the effort");
    }

    // Tool-specific objections
    const modLower = modifiers.join(" ").toLowerCase();
    if (modLower.includes("attached to current tools")) {
      objections.push("current tools work fine");
      objections.push("don't want to switch");
    }

    return objections;
  }

  private deriveMirrorTerms(themes: string[], personaType: string): string[] {
    const terms: string[] = [...themes];

    // Add role-specific terminology
    const lower = personaType.toLowerCase();
    if (lower.includes("sre")) {
      terms.push("reliability", "SLO", "incident");
    }
    if (lower.includes("platform")) {
      terms.push("developer experience", "internal platform");
    }
    if (lower.includes("devops")) {
      terms.push("CI/CD", "deployment");
    }

    return terms;
  }

  private deriveAvoidTerms(otelFamiliarity: string): string[] {
    const avoid: string[] = [];

    // Avoid jargon if not familiar
    if (
      otelFamiliarity.includes("never") ||
      otelFamiliarity.includes("aware")
    ) {
      avoid.push("span", "trace context", "baggage", "exemplars");
    }

    return avoid;
  }

  private buildPromptAddendum(
    tone: string,
    brevity: "short" | "medium",
    skepticism: "low" | "medium" | "high",
    ventingTriggers: string[],
    personaBehavior: {
      revealWhenEarned: string[];
      resistIfPitched: string[];
      objections: string[];
    }
  ): string {
    const parts: string[] = [];

    parts.push(`Tone: Speak in a ${tone} manner.`);

    parts.push(
      `Response length: Keep responses ${
        brevity === "short" ? "brief (1-2 sentences)" : "moderate (2-4 sentences)"
      }.`
    );

    if (skepticism === "high") {
      parts.push(
        "Skepticism: Express doubt about claims; ask 'how' and 'why' questions."
      );
    } else if (skepticism === "medium") {
      parts.push("Skepticism: Show cautious interest; probe for details.");
    }

    if (ventingTriggers.length > 0) {
      parts.push(
        `Pain points: When discussing ${ventingTriggers.join(
          ", "
        )}, express frustration naturally.`
      );
    }

    if (personaBehavior.objections.length > 0) {
      parts.push(
        `Objections: ${personaBehavior.objections.join(", ")}. Raise these if appropriate.`
      );
    }

    parts.push(
      `Trust: Only reveal ${personaBehavior.revealWhenEarned.join(
        ", "
      )} after the trainee has demonstrated genuine curiosity about your challenges.`
    );

    parts.push(
      `Resistance: Push back if the trainee ${personaBehavior.resistIfPitched.join(
        ", "
      )}.`
    );

    return parts.join(" ");
  }
}

/**
 * OpenAI enrichment provider stub
 * Only used when OPENAI_API_KEY is present
 */
export class OpenAIEnrichmentProvider implements EnrichmentProvider {
  private apiKey: string;

  constructor(apiKey?: string) {
    if (!apiKey) {
      throw new Error(
        "OpenAI API key is required for OpenAIEnrichmentProvider. Set OPENAI_API_KEY environment variable."
      );
    }
    this.apiKey = apiKey;
  }

  async enrich(input: EnrichmentInput): Promise<EnrichmentResult> {
    // TODO: Implement OpenAI-based enrichment
    throw new Error(
      "OpenAI enrichment not yet implemented. Use mock provider for now."
    );
  }
}

/**
 * Get the appropriate enrichment provider based on environment
 */
export function getEnrichmentProvider(): EnrichmentProvider {
  const providerType = process.env.ENRICHMENT_PROVIDER || "mock";

  if (providerType === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn(
        "ENRICHMENT_PROVIDER=openai but OPENAI_API_KEY not found. Falling back to mock."
      );
      return new MockEnrichmentProvider();
    }
    return new OpenAIEnrichmentProvider(apiKey);
  }

  return new MockEnrichmentProvider();
}
