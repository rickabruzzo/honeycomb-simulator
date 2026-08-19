import { describe, it, expect } from "vitest";
import { postProcessAttendeeText } from "./postProcess";

const WAR_STORY = [
  "We had an outage back in March.",
  "Checkout was failing for about twenty minutes before anyone noticed.",
  "Support saw it before we did, which was humbling.",
  "We spent the first half hour arguing about which service to even look at.",
  "Turned out to be a connection pool nobody had ever instrumented.",
  "I still think about that one.",
].join(" ");

describe("postProcessAttendeeText defaults (template path)", () => {
  it("still clips to two sentences so the deterministic banks are unchanged", () => {
    const out = postProcessAttendeeText(WAR_STORY);
    expect(out.match(/[.!?]/g)?.length).toBe(2);
  });

  it("still enforces the legacy character allowance", () => {
    expect(postProcessAttendeeText(WAR_STORY).length).toBeLessThanOrEqual(220);
  });
});

describe("postProcessAttendeeText with an explicit budget (LLM path)", () => {
  it("preserves a six-sentence war story", () => {
    const out = postProcessAttendeeText(WAR_STORY, undefined, {
      maxSentences: 6,
      maxChars: 1200,
    });
    expect(out).toBe(WAR_STORY);
  });

  it("still clips beyond the given budget, at a sentence boundary", () => {
    const out = postProcessAttendeeText(WAR_STORY, undefined, {
      maxSentences: 3,
      maxChars: 1200,
    });
    expect(out.match(/[.!?]/g)?.length).toBe(3);
    expect(out.endsWith(".")).toBe(true);
  });

  it("respects a character ceiling and ends on a sentence", () => {
    const runaway = "This is a sentence about alert noise. ".repeat(60);
    const out = postProcessAttendeeText(runaway, undefined, {
      maxSentences: 40,
      maxChars: 1200,
    });
    expect(out.length).toBeLessThanOrEqual(1200);
    expect(out.endsWith(".")).toBe(true);
  });
});

describe("postProcessAttendeeText sanitizers", () => {
  it("strips markdown emphasis", () => {
    expect(postProcessAttendeeText("That is **really** annoying.")).toBe("That is really annoying.");
  });
  it("strips leading bullets", () => {
    expect(postProcessAttendeeText("- Datadog for metrics.")).toBe("Datadog for metrics.");
  });
  it("strips hidden-state narration in parentheses", () => {
    expect(
      postProcessAttendeeText("(Moves firmly into PAIN DISCOVERY) Alerts are the worst part.")
    ).toBe("Alerts are the worst part.");
  });
  it("strips a question lobbed back at the trainee", () => {
    expect(postProcessAttendeeText("We use Grafana. What about you?")).toBe("We use Grafana.");
  });
});
