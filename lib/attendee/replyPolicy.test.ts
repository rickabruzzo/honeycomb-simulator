import { describe, it, expect } from "vitest";
import { decideReplyOwner } from "./replyPolicy";
import type { DirectorDirective } from "./conversationDirector";

const d = (over: Partial<DirectorDirective>): DirectorDirective =>
  ({ stage: "DISCOVERY", move: "answer", tone: "curious", ...over }) as DirectorDirective;

describe("decideReplyOwner", () => {
  it("hands pain disclosure to the LLM", () => {
    expect(decideReplyOwner(d({ move: "share_pain" }))).toBe("llm");
  });

  it("hands clarifying follow-ups to the LLM", () => {
    expect(decideReplyOwner(d({ move: "ask_clarifying" }))).toBe("llm");
  });

  it("hands guarded deflection to the LLM", () => {
    expect(decideReplyOwner(d({ move: "deflect" }))).toBe("llm");
  });

  it("hands a general answer to the LLM", () => {
    expect(decideReplyOwner(d({ move: "answer" }))).toBe("llm");
  });

  it("keeps tool-anchored answers on templates so the stack stays concrete", () => {
    expect(decideReplyOwner(d({ move: "answer", toolAnchored: true }))).toBe("template");
  });

  it("keeps small-talk answers on templates", () => {
    expect(decideReplyOwner(d({ move: "answer", smallTalk: true }))).toBe("template");
  });

  // The directive flags are only set under some stage conditions, so the policy also
  // reads the trainee text directly. Without this, 75% of tool questions and 100% of
  // small talk were being handed to the LLM.
  it("keeps tool questions on templates even when the flag is unset", () => {
    expect(decideReplyOwner(d({ move: "answer" }), "What tools are you using today?")).toBe("template");
    expect(decideReplyOwner(d({ move: "answer" }), "What's in your stack right now?")).toBe("template");
  });

  it("keeps small talk on templates even when the flag is unset", () => {
    expect(decideReplyOwner(d({ move: "answer" }), "How's the conference going?")).toBe("template");
  });

  it("still hands pain and impact questions to the LLM", () => {
    expect(decideReplyOwner(d({ move: "share_pain" }), "What's the hardest part when something breaks?")).toBe("llm");
    expect(decideReplyOwner(d({ move: "answer" }), "That sounds rough - what does that cost you?")).toBe("llm");
  });

  it.each(["ask_hook", "ask_demo", "ask_docs", "ask_rollout_effort", "ask_pricing", "ask_badge", "exit"] as const)(
    "keeps scripted move %s on templates",
    (move) => {
      expect(decideReplyOwner(d({ move }))).toBe("template");
    }
  );

  it("respects an explicit hook override from the director", () => {
    expect(decideReplyOwner(d({ move: "answer", hookOverride: "So what do you all do?" }))).toBe("template");
  });

  it("respects an explicit concrete override from the director", () => {
    expect(decideReplyOwner(d({ move: "share_pain", concreteOverride: "We use Datadog." }))).toBe("template");
  });
});
