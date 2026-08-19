import { describe, it, expect } from "vitest";
import { isTraineeBadgeOffer } from "./conversationDirector";

describe("isTraineeBadgeOffer", () => {
  it.each([
    "I'd be happy to, let me scan your badge and we can have a team member reach out",
    "Can I scan your badge?",
    "Let me grab your badge before you go",
    "I'll get your contact info and have someone follow up",
    "We can have someone reach out after the show",
  ])("detects the CTA in: %s", (text) => {
    expect(isTraineeBadgeOffer(text)).toBe(true);
  });

  it.each([
    "What are you using for observability today?",
    "That sounds rough - what does that cost you?",
    "Honeycomb can sit alongside Datadog",
  ])("does not fire on: %s", (text) => {
    expect(isTraineeBadgeOffer(text)).toBe(false);
  });
});
