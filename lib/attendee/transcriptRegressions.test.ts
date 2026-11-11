/**
 * Regressions from four real sessions exported on 2026-11-11 (Whitney H., Erica B., Jamie D.,
 * Michael S.). Each case quotes the line that went wrong.
 */
import { describe, it, expect } from "vitest";
import type { SessionState } from "../storage";
import {
  decideNextMove,
  isTraineeDemoOffer,
  isSmallTalkQuestion,
} from "./conversationDirector";
import { decideReplyOwner } from "./replyPolicy";
import { generateStackEvalAnswer } from "./generateAttendeeReply";
import { detectAcceptedDemoOffer } from "../outcomeCommitment";
import { analyzeTraineeMessage, shouldAdvanceState } from "../simulator";

function session(
  lines: Array<[("system" | "trainee" | "attendee"), string]>,
  over: Partial<SessionState> = {}
): SessionState {
  return {
    id: "regression",
    currentState: "EXPLORATION",
    stateHistory: [],
    transcript: lines.map(([type, text], i) => ({
      id: `m${i}`,
      type,
      text,
      timestamp: new Date(1_800_000_000_000 + i * 1000).toISOString(),
    })),
    violations: [],
    kickoff: { attendeeProfile: "Persona: Software Developer" },
    startTime: new Date().toISOString(),
    active: true,
    ...over,
  } as SessionState;
}

// Whitney's session up to her first demo offer.
const whitney = () =>
  session(
    [
      ["system", "Session started. Current state: ICEBREAKER"],
      ["attendee", "*approaches looking visibly frustrated*"],
      ["trainee", "Hey there, how's the conference been for you?"],
      ["attendee", "Good so far — my feet are already done. I'm here to see what's new in tracing and incident workflows."],
      ["trainee", "Yea absolutely, we're here every Kubecon. We just announced team agents, what are you guys using currently for tracing?"],
      ["attendee", "We're mostly on Datadog APM right now, plus whatever logs we can scrape together when something breaks."],
      ["trainee", "Got it, Datadog APM is pretty common. How long does it take to scrape those logs together usually?"],
      ["attendee", "Honestly depends on the night — could be twenty minutes just jumping between dashboards and grepping log groups."],
    ],
    { currentTools: ["datadog"] } as Partial<SessionState>
  );

describe("attendee loop (Whitney H.)", () => {
  const offers = [
    "Wow, that's a lot to deal with and regularly too. We just announced team agents that do incident investigations when SLOs fire, want me to have the tech team show you how it works?",
    "Yea, Datadog is good when the data is pre-indexed definitely. Want to see how tracing here works?",
    "That sounds like a lot. We do tracing a little differently here, want me to show you?",
  ];

  it.each(offers)("recognizes the demo offer: %s", (line) => {
    expect(isTraineeDemoOffer(line)).toBe(true);
  });

  it("does not treat a discovery question as an offer", () => {
    expect(isTraineeDemoOffer("What are you guys using currently for tracing?")).toBe(false);
    expect(isTraineeDemoOffer("How often is this happening?")).toBe(false);
  });

  it.each(offers)("hands the offer to the LLM instead of the canned stack bank: %s", (line) => {
    const s = whitney();
    const directive = decideNextMove(s, undefined, line);
    expect(directive.traineeOffer).toBe("demo");
    expect(directive.toolAnchored).toBeFalsy();
    expect(decideReplyOwner(directive, line)).toBe("llm");
  });

  it("does not answer an OTel question with a canned Datadog complaint", () => {
    const line =
      "Absolutely, speed and accuracy is the name of the game during a production incident. We have a collector that can be instrumented via OpenTelemetry, are you currently on Otel?";
    const directive = decideNextMove(whitney(), undefined, line);
    expect(directive.toolAnchored).toBeFalsy();
  });

  it("never repeats a stack-bank line already said in the session", () => {
    // Whitney's attendee said "The biggest gap with Datadog..." twice, four turns apart: the
    // bank was indexed by turn count and the repeat check only looked back 3 messages.
    const s = whitney();
    const seen = new Set<string>();
    for (let turn = 0; turn < 6; turn++) {
      const line = generateStackEvalAnswer(s, turn);
      if (line === null) break; // bank exhausted -> caller routes elsewhere
      expect(seen.has(line)).toBe(false);
      seen.add(line);
      s.transcript.push({ id: `a${turn}`, type: "attendee", text: line, timestamp: "" } as never);
    }
    expect(seen.size).toBe(4); // every bank line used once, then null
  });
});

describe("accepted handoff counts as a next step", () => {
  it("Jamie D.: 'Sure, that's probably the right move.'", () => {
    expect(
      detectAcceptedDemoOffer(
        "That's great that you're using OpenTelemetry! We are OTel-Native, so at least that part is easily covered. For making sense of it, I'd love to pass you to a technical support person to show you a bit more about the product's capabilities.",
        "Sure, that's probably the right move at this point."
      )
    ).toBe(true);
  });

  it("Erica B.: 'Yeah, I could do five minutes'", () => {
    expect(
      detectAcceptedDemoOffer(
        "Would you be open to a quick 5-minute walkthrough with one of our technical specialists, using that exact scenario?",
        "Yeah, I could do five minutes - just have them focus on the on-call piece."
      )
    ).toBe(true);
  });

  it("a hedge is not an acceptance", () => {
    expect(
      detectAcceptedDemoOffer("Want a quick demo?", "Sure, but maybe later - not right now.")
    ).toBe(false);
  });

  it("an acceptance without an offer is not a demo commitment", () => {
    expect(detectAcceptedDemoOffer("How often does that happen?", "Yeah, a couple times a month.")).toBe(false);
  });
});

describe("fairer rule checks", () => {
  const jamieLine =
    "That's great that you're using OpenTelemetry! We are OTel-Native, so at least that part is easily covered.";

  it("Jamie D.: no OTel-assumption violation after the attendee confirmed OTel", () => {
    const prior = [
      { type: "trainee", text: "That's tough to do all that work to stitch things together. Do you use OpenTelemetry?" },
      { type: "attendee", text: "Yeah, we've got it instrumented already, traces flowing out of most of our services." },
    ];
    const a = analyzeTraineeMessage(jamieLine, "SOLUTION_FRAMING", { priorTranscript: prior });
    expect(a.issues).toEqual([]);
  });

  it("still flags a genuine assumption when OTel never came up", () => {
    const a = analyzeTraineeMessage(jamieLine, "EXPLORATION", { priorTranscript: [] });
    expect(a.issues).toContain("Assumed OTel familiarity without asking");
  });

  it.each([
    "Oof, that's rough. Sounds like a tough night, how often is this happening?",
    "That changes the conversation. It's not just about reducing troubleshooting time anymore.",
    "Wow, that's a lot to deal with and regularly too.",
  ])("counts plain validation as empathy: %s", (line) => {
    const a = analyzeTraineeMessage(line, "PAIN_DISCOVERY");
    expect(a.isEmpathetic).toBe(true);
    expect(shouldAdvanceState("PAIN_DISCOVERY", a)).toBe(true);
  });
});

describe("small talk without punctuation (Michael S.)", () => {
  it("recognizes 'uhm yeah how's the conference'", () => {
    expect(isSmallTalkQuestion("Ahh cool cool. *wipes sweat of forehead* uhm yeah how's the conference")).toBe(true);
  });
});
