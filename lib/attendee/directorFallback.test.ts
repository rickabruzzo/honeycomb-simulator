import { describe, expect, it } from "vitest";
import { intentFallbackMove } from "./conversationDirector";

/**
 * Once the badge scan is on the table (the trainee offered it, or the attendee already asked
 * for it), the attendee must not ask for it again. The commit_ready fallback used to return
 * ask_badge unconditionally, which produced "Can you scan my badge…" twice in a row.
 */
describe("intentFallbackMove for commit_ready", () => {
  it("asks for the badge when it hasn't come up yet", () => {
    expect(intentFallbackMove("commit_ready", [], true, false)).toBe("ask_badge");
  });

  it("answers instead of asking again once the badge scan has been offered", () => {
    // Another canned CTA question ("walk me through…") would be the same stuck record; the
    // greeter usually just asked something ("anything you'd want them to cover?"), so answer it.
    expect(intentFallbackMove("commit_ready", [], true, true)).toBe("answer");
  });

  it("answers instead of asking again right after it already asked", () => {
    expect(intentFallbackMove("commit_ready", ["ask_badge"], true, false)).toBe("answer");
  });
});
