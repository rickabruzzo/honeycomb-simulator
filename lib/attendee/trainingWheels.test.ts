import { describe, it, expect } from "vitest";
import { computeRevealed } from "./trainingWheels";
import type { SessionState } from "../storage";

// Minimal persona with primary + secondary pains and keyworded anchors.
const persona = {
  id: "sre-canonical",
  name: "SRE",
  personaType: "Site Reliability Engineer",
  modifiers: [],
  emotionalPosture: "pragmatic",
  toolingBias: "Prometheus + Grafana",
  otelFamiliarity: "considering",
  painAnchors: [
    { id: "debug", pain: "MTTR is too high.", keywords: ["root cause", "mttr"], priority: "primary", testPhrases: [] },
    { id: "oncall", pain: "On-call is brutal.", keywords: ["on-call", "pager"], priority: "primary", testPhrases: [] },
    { id: "minor", pain: "Secondary thing.", keywords: ["misc"], priority: "secondary", testPhrases: [] },
  ],
} as unknown as NonNullable<SessionState["persona"]>;

function session(opts: {
  on?: boolean;
  traineeTurns?: number;
  attendeeText?: string;
  withPersona?: boolean;
}): SessionState {
  const { on = true, traineeTurns = 0, attendeeText = "", withPersona = true } = opts;
  const transcript: SessionState["transcript"] = [];
  for (let i = 0; i < traineeTurns; i++) {
    transcript.push({ id: `t${i}`, type: "trainee", text: "q", timestamp: "" });
  }
  if (attendeeText) transcript.push({ id: "a", type: "attendee", text: attendeeText, timestamp: "" });
  return {
    trainingWheels: on,
    persona: withPersona ? persona : undefined,
    transcript,
  } as unknown as SessionState;
}

describe("computeRevealed", () => {
  it("returns null when training wheels is off", () => {
    expect(computeRevealed(session({ on: false, traineeTurns: 5 }))).toBeNull();
  });

  it("reveals nothing at the very start", () => {
    expect(computeRevealed(session({ traineeTurns: 1 }))).toEqual({});
  });

  it("reveals role once genuinely in discovery (>= 2 turns)", () => {
    const r = computeRevealed(session({ traineeTurns: 2 }));
    expect(r?.role).toBe("Site Reliability Engineer");
    expect(r?.pains).toBeUndefined();
  });

  it("early-unlocks a pain the attendee actually voices (keyword hit) before the turn threshold", () => {
    const r = computeRevealed(session({ traineeTurns: 2, attendeeText: "it's the root cause hunt that kills us" }));
    expect(r?.pains).toEqual(["MTTR is too high."]);
  });

  it("reveals all PRIMARY pains by ~4 exchanges even without keyword hits (reliable progression)", () => {
    const r = computeRevealed(session({ traineeTurns: 4, attendeeText: "we just eyeball timestamps" }));
    expect(r?.pains).toEqual(["MTTR is too high.", "On-call is brutal."]); // secondary excluded
    // deeper read not yet (needs depth)
    expect(r?.posture).toBeUndefined();
  });

  it("reveals the deeper read once pain is on the table and there's real depth (>= 6)", () => {
    const r = computeRevealed(session({ traineeTurns: 6, attendeeText: "on-call is brutal" }));
    expect(r?.posture).toBe("pragmatic");
    expect(r?.tooling).toBe("Prometheus + Grafana");
    expect(r?.otel).toBe("considering");
  });

  it("returns empty object when the session has no persona", () => {
    expect(computeRevealed(session({ traineeTurns: 5, withPersona: false }))).toEqual({});
  });
});
