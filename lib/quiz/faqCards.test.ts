import { describe, expect, it } from "vitest";
import { faqSections, faqToCards } from "./faqCards";

const FAQ = `# Honeycomb Booth FAQ
Source of truth: honeycomb.io, checked Oct 2026.

## GENERAL PRODUCT QUESTIONS

**What is Honeycomb?**

Observability built for the AI era. Tracing, metrics and logs live on one platform.

Sources: honeycomb.io/, honeycomb.io/about

**How does Honeycomb use AI?**

Two ways: observability with AI, and observability for AI.

- Canvas: a shared investigation workspace. On every plan, including Free.
- MCP server: connects any MCP-compliant tool to your Honeycomb data.

Sources: honeycomb.io/platform/canvas

## OPENTELEMETRY / INGEST QUESTIONS

**What is OpenTelemetry?** The open-source, vendor-neutral standard for telemetry. Sources: honeycomb.io/platform/opentelemetry
**Is the data encrypted?** Yes, in transit and at rest. Source: honeycomb.io/pricing

## COMPETITOR QUESTIONS

Honeycomb publishes comparisons for Datadog and others. Give one plain difference. Source: honeycomb.io/why-honeycomb/comparisons

**vs Datadog?** Datadog relies on custom metrics. Honeycomb keeps every event in full detail. Source: honeycomb.io/why-honeycomb/comparisons/datadog

## POSITIONING (USE IN CONVERSATIONS)
Headline: "Observability built for the AI era." (honeycomb.io/)

## ESCALATION GUIDANCE (BOOTH PROCESS)

"Let me connect you with one of our Technical Support Staffers."
`;

describe("faqToCards", () => {
  const cards = faqToCards(FAQ);

  it("makes one card per bold question, in order", () => {
    expect(cards.map((c) => c.question)).toEqual([
      "What is Honeycomb?",
      "How does Honeycomb use AI?",
      "What is OpenTelemetry?",
      "Is the data encrypted?",
      "vs Datadog?",
    ]);
  });

  it("handles the multi-line shape: paragraphs, bullets and a trailing Sources line", () => {
    const ai = cards[1];
    expect(ai.answer).toEqual([
      "Two ways: observability with AI, and observability for AI.",
      "- Canvas: a shared investigation workspace. On every plan, including Free.",
      "- MCP server: connects any MCP-compliant tool to your Honeycomb data.",
    ]);
    expect(ai.source).toBe("honeycomb.io/platform/canvas");
    expect(cards[0].source).toBe("honeycomb.io/, honeycomb.io/about");
  });

  it("handles the single-line shape and splits the inline source off the answer", () => {
    expect(cards[2].answer).toEqual(["The open-source, vendor-neutral standard for telemetry."]);
    expect(cards[2].source).toBe("honeycomb.io/platform/opentelemetry");
    expect(cards[3].answer).toEqual(["Yes, in transit and at rest."]);
  });

  it("ignores section intros, positioning and escalation prose, and the authoring note", () => {
    expect(cards.some((c) => /publishes comparisons|Headline|Technical Support Staffers/.test(c.answer.join(" ")))).toBe(false);
    expect(cards.some((c) => /Source of truth/.test(c.question))).toBe(false);
  });

  it("renders shouted headings as readable section names", () => {
    expect(faqSections(cards)).toEqual([
      "General Product Questions",
      "OpenTelemetry / Ingest Questions",
      "Competitor Questions",
    ]);
  });

  it("gives every card a stable, unique id", () => {
    const ids = cards.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("general-product-questions-what-is-honeycomb");
    expect(faqToCards(FAQ)[0].id).toBe(ids[0]);
  });

  it("returns nothing for a missing FAQ", () => {
    expect(faqToCards(null)).toEqual([]);
    expect(faqToCards("")).toEqual([]);
  });
});
