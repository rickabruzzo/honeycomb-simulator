import { describe, it, expect, afterEach } from "vitest";
import {
  parseEnrichmentJson,
  validateAndTransformEnrichment,
  getEnrichmentProvider,
  MockEnrichmentProvider,
  AnthropicEnrichmentProvider,
  OpenAIEnrichmentProvider,
} from "./provider";

/**
 * The LLM enrichment providers need a live model, so these assert the CONTRACT the shared
 * helpers and the factory guarantee — not model output. The Anthropic path in particular has
 * no native JSON mode, so fence-stripping and the transform are the parts that must hold.
 */

const WELL_FORMED = {
  attendeeStyleGuide: { tone: "reserved, cautious", brevity: "short", skepticism: "high" },
  domainContext: {
    keyConcerns: ["alert fatigue", "slow root-cause"],
    commonTools: ["Datadog", "PagerDuty"],
  },
  personaBehavior: {
    objections: ["current tools work fine"],
    revealConditions: ["budget constraints"],
    ventingTriggers: ["3am pages"],
  },
  vocabHints: { prefer: ["SLO", "on-call"], avoid: ["exemplars"] },
  promptAddendum: "Be terse and skeptical until the trainee earns trust.",
};

describe("parseEnrichmentJson", () => {
  it("parses bare JSON", () => {
    expect(parseEnrichmentJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips a ```json code fence (the Anthropic no-JSON-mode case)", () => {
    const fenced = '```json\n{"a":1}\n```';
    expect(parseEnrichmentJson(fenced)).toEqual({ a: 1 });
  });

  it("strips a bare ``` fence", () => {
    expect(parseEnrichmentJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("throws on non-JSON (triggers provider fallback upstream)", () => {
    expect(() => parseEnrichmentJson("not json at all")).toThrow();
  });
});

describe("validateAndTransformEnrichment", () => {
  it("maps the LLM JSON contract onto the internal EnrichmentResult shape", () => {
    const out = validateAndTransformEnrichment(WELL_FORMED);
    // ventingTriggers is sourced from personaBehavior, not the style guide, in the LLM contract.
    expect(out.attendeeStyleGuide.ventingTriggers).toEqual(["3am pages"]);
    expect(out.attendeeStyleGuide.brevity).toBe("short");
    expect(out.attendeeStyleGuide.skepticism).toBe("high");
    // keyConcerns -> themes, commonTools -> typicalTopics.
    expect(out.domainContext.themes).toEqual(["alert fatigue", "slow root-cause"]);
    expect(out.domainContext.typicalTopics).toEqual(["Datadog", "PagerDuty"]);
    // revealConditions -> revealWhenEarned.
    expect(out.personaBehavior.revealWhenEarned).toEqual(["budget constraints"]);
    expect(out.vocabHints.mirrorTerms).toEqual(["SLO", "on-call"]);
    expect(out.vocabHints.avoidTerms).toEqual(["exemplars"]);
    expect(out.promptAddendum).toContain("terse");
  });

  it("normalizes an out-of-range brevity/skepticism to the medium default", () => {
    const out = validateAndTransformEnrichment({
      ...WELL_FORMED,
      attendeeStyleGuide: { tone: "x", brevity: "verbose", skepticism: "extreme" },
    });
    expect(out.attendeeStyleGuide.brevity).toBe("medium");
    expect(out.attendeeStyleGuide.skepticism).toBe("medium");
  });

  it("throws when a required section is missing (so the provider falls back)", () => {
    const { promptAddendum: _drop, ...missing } = WELL_FORMED;
    expect(() => validateAndTransformEnrichment(missing)).toThrow();
  });
});

describe("getEnrichmentProvider", () => {
  const saved = {
    ENRICHMENT_PROVIDER: process.env.ENRICHMENT_PROVIDER,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  };

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("defaults to the mock provider when unset", () => {
    delete process.env.ENRICHMENT_PROVIDER;
    expect(getEnrichmentProvider()).toBeInstanceOf(MockEnrichmentProvider);
  });

  it("returns the Anthropic provider when configured with a key", () => {
    process.env.ENRICHMENT_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "sk-test";
    expect(getEnrichmentProvider()).toBeInstanceOf(AnthropicEnrichmentProvider);
  });

  it("falls back to the mock when anthropic is selected but no key is present", () => {
    process.env.ENRICHMENT_PROVIDER = "anthropic";
    delete process.env.ANTHROPIC_API_KEY;
    expect(getEnrichmentProvider()).toBeInstanceOf(MockEnrichmentProvider);
  });

  it("returns the OpenAI provider when configured with a key", () => {
    process.env.ENRICHMENT_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-test";
    expect(getEnrichmentProvider()).toBeInstanceOf(OpenAIEnrichmentProvider);
  });
});
