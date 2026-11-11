import { describe, it, expect } from "vitest";
import { buildSessionReviewMessage } from "./sessionReview";
import type { SessionState } from "../storage";

const session = {
  id: "s1",
  kickoff: { attendeeProfile: "Persona: SRE\nOpenTelemetry familiarity: none" },
  violations: ["Assumed OTel familiarity without asking"],
  transcript: [
    { id: "1", type: "trainee", text: "Want me to show you?", timestamp: "2026-11-10T13:05:45.904Z" },
    { id: "2", type: "attendee", text: "Datadog gives us the raw data.", timestamp: "2026-11-10T13:05:45.905Z" },
    { id: "3", type: "system", text: "SESSION FEEDBACK\n...", timestamp: "2026-11-10T13:06:00.000Z" },
  ],
} as unknown as SessionState;

describe("buildSessionReviewMessage", () => {
  it("includes the hidden profile, flags, and timing so instant template replies are visible", () => {
    const msg = buildSessionReviewMessage(session, null, "Was the demo offer ignored?");
    expect(msg).toContain("OpenTelemetry familiarity: none");
    expect(msg).toContain("RULE-CHECK FLAGS: Assumed OTel familiarity without asking");
    expect(msg).toContain("[+0.0s] Attendee: Datadog gives us the raw data.");
    expect(msg).toContain("ADMIN'S QUESTION / FOCUS");
    expect(msg).toContain("CURRENT SCORE: not scored");
  });

  it("drops the old auto-generated feedback block from the transcript", () => {
    expect(buildSessionReviewMessage(session, null)).not.toContain("SESSION FEEDBACK");
  });
});
