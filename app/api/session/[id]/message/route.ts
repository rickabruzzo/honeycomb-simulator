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
import { getChatProvider, MockChatProvider } from "@/lib/llm/chatProvider";
import type { ChatInput } from "@/lib/llm/chatTypes";
import { withSpan, withChildSpan } from "@/lib/telemetry";
import { getEnrichment, saveEnrichment } from "@/lib/llm/enrichmentStore";
import { getEnrichmentProvider } from "@/lib/llm/provider";
import type { EnrichmentInput } from "@/lib/llm/enrichmentTypes";

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
  return withSpan(
    "hc.event.message",
    async (span) => {
      const { id } = await params;

      span.setAttribute("route", "/api/session/[id]/message");
      span.setAttribute("method", "POST");
      span.setAttribute("event_type", "message");
      span.setAttribute("session_id", id);

      try {
        const session = await getSession(id);
        if (!session || !session.active) {
          span.setAttribute("status", 404);
          span.setAttribute("error", "session_not_found");
          return NextResponse.json(
            { error: "Session not found or inactive" },
            { status: 404 }
          );
        }

        if (session.kickoff.conferenceId) {
          span.setAttribute("conference_id", session.kickoff.conferenceId);
        }
        if (session.kickoff.personaId) {
          span.setAttribute("persona_id", session.kickoff.personaId);
        }
        if (session.kickoff.traineeId) {
          span.setAttribute("trainee_id", session.kickoff.traineeId);
        }
        span.setAttribute("difficulty", session.kickoff.difficulty);
        span.setAttribute("current_state", session.currentState);

        // On-demand enrichment: if missing, try to load from cache or generate
        if (!session.kickoff.enrichment && session.kickoff.conferenceId && session.kickoff.personaId) {
          try {
            let enrichment = await getEnrichment(
              session.kickoff.conferenceId,
              session.kickoff.personaId
            );

            // If not in cache, generate on-demand (this CAN block message, but invite was fast)
            if (!enrichment && session.kickoff.conferenceContext && session.kickoff.attendeeProfile) {
              console.log("[message] Generating enrichment on-demand for session:", id);

              const provider = getEnrichmentProvider();
              const enrichmentInput: EnrichmentInput = {
                conferenceId: session.kickoff.conferenceId,
                personaId: session.kickoff.personaId,
                conferenceContext: session.kickoff.conferenceContext,
                attendeeProfile: session.kickoff.attendeeProfile,
              };

              // Generate with 8s timeout
              const timeoutPromise = new Promise<null>((_, reject) =>
                setTimeout(() => reject(new Error("Enrichment timeout")), 8000)
              );

              try {
                enrichment = await Promise.race([
                  provider.enrich(enrichmentInput),
                  timeoutPromise,
                ]);

                if (enrichment) {
                  await saveEnrichment(enrichment);
                  session.kickoff.enrichment = enrichment;
                  span.setAttribute("enrichment_generated_on_demand", true);
                }
              } catch (err) {
                console.error("[message] On-demand enrichment failed:", err);
                span.setAttribute("enrichment_generation_failed", true);
              }
            } else if (enrichment) {
              // Found in cache - add to session
              session.kickoff.enrichment = enrichment;
              span.setAttribute("enrichment_loaded_from_cache", true);
            }
          } catch (error) {
            console.error("[message] Failed to load enrichment:", error);
          }
        }

        const { message } = await request.json();
        if (!message || typeof message !== "string") {
          span.setAttribute("status", 400);
          span.setAttribute("error", "message_required");
          return NextResponse.json({ error: "Message is required" }, { status: 400 });
        }

        span.setAttribute("message_length", message.length);

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
          span.setAttribute("violations_count", session.violations.length);
        }

        // 4) Build conversation history for ChatProvider (excluding system messages)
        const conversationHistory = session.transcript
          .filter((m) => m.type !== "system")
          .map((m) => ({
            role: m.type === "trainee" ? ("user" as const) : ("assistant" as const),
            content: m.text,
          }));

        span.setAttribute("conversation_length", conversationHistory.length);

        // 5) Generate attendee response using ChatProvider
        let attendeeResponseText: string;
        let chatMeta: { provider: string; model?: string } | undefined;

        try {
          // Build system prompt with enrichment if available
          const systemPrompt = buildAttendeePrompt(
            session.currentState,
            session.kickoff.attendeeProfile,
            session.kickoff.difficulty,
            conversationHistory,
            session.kickoff.enrichment
          );

          // Prepare chat input
          const chatInput: ChatInput = {
            systemPrompt,
            conversation: conversationHistory,
            sessionId: session.id,
          };

          // Get provider and generate response with child span
          const provider = getChatProvider();

          const result = await withChildSpan(
            "hc.dep.chat.generate",
            async (childSpan) => {
              childSpan.setAttribute("dep_type", "chat");
              childSpan.setAttribute("session_id", session.id);
              childSpan.setAttribute("current_state", session.currentState);
              childSpan.setAttribute("conversation_length", conversationHistory.length);

              const res = await provider.generate(chatInput);

              childSpan.setAttribute("provider", res.provider);
              if (res.model) {
                childSpan.setAttribute("model", res.model);
              }
              childSpan.setAttribute("response_length", res.text.length);

              return res;
            },
            { dep_type: "chat" }
          );

          attendeeResponseText = result.text;
          chatMeta = {
            provider: result.provider,
            model: result.model,
          };

          span.setAttribute("chat_provider", result.provider);
          if (result.model) {
            span.setAttribute("chat_model", result.model);
          }
        } catch (error) {
          // Fallback to mock provider if generation fails
          console.warn("[chat] Provider generation failed, falling back to mock:", {
            error: error instanceof Error ? error.message : "Unknown error",
            sessionId: session.id,
          });

          span.setAttribute("chat_fallback", true);

          try {
            const mockProvider = new MockChatProvider();
            const mockResult = await mockProvider.generate({
              systemPrompt: "",
              conversation: conversationHistory,
              sessionId: session.id,
            });
            attendeeResponseText = mockResult.text;
            chatMeta = { provider: "mock (fallback)" };
            span.setAttribute("chat_provider", "mock_fallback");
          } catch (fallbackError) {
            // Ultimate fallback: use canned response
            console.error("[chat] Mock provider also failed:", fallbackError);
            attendeeResponseText = pickMockResponse(session.currentState);
            chatMeta = { provider: "canned (emergency fallback)" };
            span.setAttribute("chat_provider", "canned_emergency");
          }
        }

        // 6) Add attendee response to transcript
        const attendeeMsg = {
          id: randomUUID(),
          type: "attendee" as const,
          text: attendeeResponseText,
          timestamp: new Date().toISOString(),
        };
        session.transcript.push(attendeeMsg);

        span.setAttribute("response_length", attendeeResponseText.length);

        // 7) Advance state (server-side decision only)
        let stateAdvanced = false;
        if (shouldAdvanceState(session.currentState, analysis)) {
          const nextState = getNextState(session.currentState);
          if (nextState !== session.currentState) {
            session.stateHistory.push({
              from: session.currentState,
              to: nextState,
              timestamp: new Date().toISOString(),
            });
            session.currentState = nextState;
            stateAdvanced = true;

            span.setAttribute("state_advanced", true);
            span.setAttribute("new_state", nextState);
          }
        }

        // 8) Persist session
        await saveSession(session);

        span.setAttribute("status", 200);
        span.setAttribute("transcript_length", session.transcript.length);

        return NextResponse.json({
          message: attendeeMsg,
          currentState: session.currentState,
          violations: session.violations,
          chatMeta, // Provider metadata (optional, for debugging)
        });
      } catch (error) {
        console.error("Message error:", error);

        span.setAttribute("status", 500);
        span.setAttribute("error_message", error instanceof Error ? error.message : "Unknown error");

        return NextResponse.json(
          { error: "Failed to process message" },
          { status: 500 }
        );
      }
    },
    { route: "/api/session/[id]/message", method: "POST", event_type: "message" }
  );
}