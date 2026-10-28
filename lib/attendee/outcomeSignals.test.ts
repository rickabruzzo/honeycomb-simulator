import { describe, expect, it } from "vitest";
import { detectOutcomeFromText, detectOutcomeFromTranscript } from "./outcomeSignals";

/**
 * An outcome is a next step being asked for or agreed to, never a description of who the
 * attendee is. A role or authority statement is a READ (it tells the greeter which next step
 * fits) and must not end the conversation.
 */
describe("detectOutcomeFromText", () => {
  it("does not treat a role or authority statement as an outcome", () => {
    expect(
      detectOutcomeFromText("I run engineering for a mid-size product org, couple hundred people. Not actively shopping, just seeing what's out there.")
    ).toBe("NONE");
    expect(detectOutcomeFromText("I manage the platform team here.")).toBe("NONE");
    expect(detectOutcomeFromText("That'd be my call, but I'm just looking today.")).toBe("NONE");
  });

  it("still reads money-for-a-team talk and explicit asks as a badge scan", () => {
    expect(detectOutcomeFromText("What's the pricing for a team of fifty?")).toBe("BADGE_SCAN");
    expect(detectOutcomeFromText("We'd need to get budget approval first.")).toBe("BADGE_SCAN");
    expect(detectOutcomeFromText("Sure, scan my badge and have someone reach out.")).toBe("BADGE_SCAN");
  });

  it("keeps demo and self-serve asks", () => {
    expect(detectOutcomeFromText("Can you show me how the tracing view works?")).toBe("DEMO");
    expect(detectOutcomeFromText("I'd rather read the docs and try the free tier.")).toBe("FLYER");
  });

  it("finds no outcome in a conversation that is still discovery", () => {
    const transcript = [
      { type: "attendee" as const, text: "It's fine, kind of a blur honestly - a lot of booths, not a lot of sleep." },
      { type: "trainee" as const, text: "Anything you see on the floor getting you excited?" },
      { type: "attendee" as const, text: "Not really, honestly. Nothing's jumped out yet - mostly the same pitches with different logos." },
      { type: "trainee" as const, text: "What's your role at your company and is there anything you looking for in terms of solutions?" },
      { type: "attendee" as const, text: "I run engineering for a mid-size product org, couple hundred people. Not actively shopping, just seeing what's out there." },
    ];
    expect(detectOutcomeFromTranscript(transcript)).toBe("NONE");
  });
});
