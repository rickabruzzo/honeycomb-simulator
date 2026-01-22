// app/api/session/[id]/message/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession, saveSession } from "@/lib/storage";
import {
  analyzeTraineeMessage,
  shouldAdvanceState,
  getNextState,
  buildAttendeePrompt,
} from "@/lib/simulator";
import { randomUUID } from "crypto";

/**
 * Simple canned responses keyed by simulator state.
 * You can move this into /lib/mockAttendeeResponses.ts later if you want.
 */
const MOCK_RESPONSES: Record<string, string[]> = {
  ICEBREAKER: [
    "Hey. Quick lap between talks. What are you all covering here?",
    "Hi. I’ve got a minute. What’s the focus?",
    "I’m trying not to get pulled into a pitch — what do you all do?",
  ],
  EXPLORATION: [
    "I’m an SRE. Mostly incident response and trying to reduce toil.",
    "We run Prometheus + Grafana, plus logs in ELK. It’s… fine.",
    "My day is a mix of on-call, reliability reviews, and trying to tame alerts.",
  ],
  PAIN_DISCOVERY: [
    "We had an outage recently and it was a mess to sort through.",
    "Alert fatigue is real. Lots of noise, not enough signal.",
    "We spend too long figuring out where to start instead of fixing.",
  ],
  SOLUTION_FRAMING: [
    "Maybe. How does that help during an incident, not just after?",
    "I’m skeptical of anything that sounds like a silver bullet.",
    "What’s the overhead for engineers to adopt it?",
  ],
  OUTCOME: [
    "I can spare a few minutes if it’s focused.",
    "This sounds interesting—can we follow up after the conference?",
    "I should run, but appreciate the quick overview.",
  ],
};

function pickMockResponse(state: string) {
  const options = MOCK_RESPONSES[state] ?? MOCK_RESPONSES.ICEBREAKER;
  return options[Math.floor(Math.random() * options.length)];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> } // Next.js 15 style
) {
  try {
    const { id } = await params;

    const session = await getSession(id);
    if (!session || !session.active) {
      return NextResponse.json(
        { error: "Session not found or inactive" },
        { status: 404 }
      );
    }

    const { message } = await request.json();
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // 1) Add trainee message to transcript
    const traineeMsg = {
      id: randomUUID(),
      type: "trainee" as const,
      text: message,
      timestamp: new Date().toISOString(),
    };
    session.transcript.push(traineeMsg);

    // 2) Analyze trainee message (your rules engine)
    const analysis = analyzeTraineeMessage(message, session.currentState);

    // 3) Track violations (FIXED: removed stray '.' and use push(...spread))
    if (analysis.issues?.length > 0) {
      session.violations.push(...analysis.issues);
    }

    // 4) Build conversation history for model (excluding system)
    const conversationHistory = session.transcript
      .filter((m) => m.type !== "system")
      .map((m) => ({
        role: m.type === "trainee" ? "user" : "assistant",
        content: m.text,
      }));

    // 5) Decide whether to use mock LLM (Step 1.3)
    const useMock =
      process.env.USE_MOCK_LLM === "true" || !process.env.ANTHROPIC_API_KEY;

    let attendeeResponseText: string;

    if (useMock) {
      attendeeResponseText = pickMockResponse(session.currentState);
    } else {
      // Build prompt
      const attendeePrompt = buildAttendeePrompt(
        session.currentState,
        session.kickoff.attendeeProfile,
        session.kickoff.difficulty,
        conversationHistory
      );

      const apiKey = process.env.ANTHROPIC_API_KEY!;
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514",
          max_tokens: 800,
          system: attendeePrompt,
          // FIXED: removed stray '.' before conversationHistory
          messages: [
            ...conversationHistory,
            { role: "user", content: message },
          ],
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(
          `Claude API error: ${response.status} ${response.statusText} ${errText}`
        );
      }

      const data = await response.json();
      attendeeResponseText = data?.content?.[0]?.text ?? "(No response)";
    }

    // 6) Add attendee response to transcript
    const attendeeMsg = {
      id: randomUUID(),
      type: "attendee" as const,
      text: attendeeResponseText,
      timestamp: new Date().toISOString(),
    };
    session.transcript.push(attendeeMsg);

    // 7) Advance state (server-side decision only)
    if (shouldAdvanceState(session.currentState, analysis)) {
      const nextState = getNextState(session.currentState);
      if (nextState !== session.currentState) {
        session.stateHistory.push({
          from: session.currentState,
          to: nextState,
          timestamp: new Date().toISOString(),
        });
        session.currentState = nextState;
      }
    }

    // 8) Persist session
    await saveSession(session);

    return NextResponse.json({
      message: attendeeMsg,
      currentState: session.currentState,
      violations: session.violations,
      mockMode: useMock, // handy for UI/debug
    });
  } catch (error) {
    console.error("Message error:", error);
    return NextResponse.json(
      { error: "Failed to process message" },
      { status: 500 }
    );
  }
}