import { describe, expect, it } from "vitest";
import { detectCommittedOutcome, detectDemoCommitment } from "./outcomeCommitment";

/** The single-message commitment path must recognise accepting an offered demo, not only asking for one. */
describe("detectDemoCommitment", () => {
  it("counts accepting the demo the greeter offered", () => {
    expect(detectDemoCommitment("Yeah, go ahead and grab someone from the technical side — I'll take a quick look at the demo if it's not a long wait.")).toBe(true);
    expect(detectDemoCommitment("Sure, the demo station works for me.")).toBe(true);
    expect(detectCommittedOutcome("Yeah, let's see it.")).toBe("DEMO_READY");
  });

  it("does not fire on a description that merely mentions a demo", () => {
    expect(detectDemoCommitment("The last demo I sat through at a booth was a waste of twenty minutes.")).toBe(false);
  });
});
