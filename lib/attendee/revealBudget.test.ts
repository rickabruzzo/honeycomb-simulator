import { describe, it, expect } from "vitest";
import { getRevealBudget } from "./revealBudget";

describe("getRevealBudget — earned openness", () => {
  it("keeps a steamrolled attendee short even in pain discovery", () => {
    // Phase says pain is on the table, but the trainee has not earned it (GUARDED).
    const b = getRevealBudget("PAIN_DISCOVERY", "GUARDED");
    expect(b.lengthBudget.maxSentences).toBeLessThanOrEqual(2);
    expect(b.ventDepth).toBe("none");
  });

  it("unlocks the war story only once the trainee has earned it", () => {
    const guarded = getRevealBudget("PAIN_DISCOVERY", "GUARDED");
    const curious = getRevealBudget("PAIN_DISCOVERY", "CURIOUS");
    const engaged = getRevealBudget("PAIN_DISCOVERY", "ENGAGED");
    const committed = getRevealBudget("PAIN_DISCOVERY", "COMMITTED");

    expect(guarded.ventDepth).toBe("none");
    expect(curious.ventDepth).toBe("brief");
    expect(engaged.ventDepth).toBe("war_story");
    expect(committed.ventDepth).toBe("war_story");
  });

  it("does not allow venting outside pain-relevant phases even when engaged", () => {
    expect(getRevealBudget("ICEBREAKER", "ENGAGED").ventDepth).toBe("none");
    expect(getRevealBudget("EXPLORATION", "ENGAGED").ventDepth).toBe("none");
  });

  it("lets openness widen with the band within a phase", () => {
    const guarded = getRevealBudget("PAIN_DISCOVERY", "GUARDED").lengthBudget.maxSentences;
    const curious = getRevealBudget("PAIN_DISCOVERY", "CURIOUS").lengthBudget.maxSentences;
    const engaged = getRevealBudget("PAIN_DISCOVERY", "ENGAGED").lengthBudget.maxSentences;
    expect(guarded).toBeLessThan(curious);
    expect(curious).toBeLessThanOrEqual(engaged);
  });

  it("keeps the icebreaker short regardless of band", () => {
    expect(getRevealBudget("ICEBREAKER", "COMMITTED").lengthBudget.maxSentences).toBeLessThanOrEqual(2);
  });

  it("renders an openness directive that names the felt posture, not a number", () => {
    const guarded = getRevealBudget("PAIN_DISCOVERY", "GUARDED").opennessDirective;
    const engaged = getRevealBudget("PAIN_DISCOVERY", "ENGAGED").opennessDirective;
    expect(guarded).not.toEqual(engaged);
    expect(guarded).not.toMatch(/\d/); // no leaked numeric state
    expect(engaged).not.toMatch(/\d/);
  });

  it("falls back safely for an unknown phase", () => {
    const b = getRevealBudget("NOT_A_PHASE", "ENGAGED");
    expect(b.lengthBudget.maxSentences).toBeGreaterThanOrEqual(1);
    expect(b.ventDepth).toBe("none");
  });
});
