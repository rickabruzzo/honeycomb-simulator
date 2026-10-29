import { describe, expect, it } from "vitest";
import { makeCallbackPhrase, makeContextualCallback } from "./reactiveness";

/**
 * The callback prefix echoes a topic from the conversation ("On tracing, …"). It must only
 * ever use a real domain term; a filler word from the greeter's sentence ("Makes sense" →
 * "Around makes, …") reads as broken.
 */
const GREETER = "Makes sense. What are you using today to figure out what went wrong, and where does it fall short?";
const ATTENDEE = "Few times a week, honestly. Usually ends up being me plus whoever owns the service.";

describe("callback prefixes", () => {
  it("returns nothing when no domain term is on the table instead of echoing a filler word", () => {
    expect(makeCallbackPhrase(ATTENDEE, GREETER)).toBe("");
    for (const intent of ["ask_docs", "confused", "evaluating_fit", "neutral"]) {
      const prefix = makeContextualCallback({ lastTraineeText: GREETER, lastAttendeeText: ATTENDEE, intent, stage: "DISCOVERY" });
      expect(prefix, intent).not.toMatch(/\b(makes|sense|using|figure|wrong|fall|short)\b/i);
    }
  });

  it("still echoes a real domain term", () => {
    const prefix = makeContextualCallback({
      lastTraineeText: "What does your tracing setup look like today?",
      lastAttendeeText: ATTENDEE,
      intent: "ask_docs",
      stage: "DISCOVERY",
    });
    expect(prefix === "" || /tracing/.test(prefix)).toBe(true);
    expect(makeCallbackPhrase("Our on-call rotation is brutal.", "How are you handling alert noise?")).toMatch(/alert|on-?call/);
  });
});
