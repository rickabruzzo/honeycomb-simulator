// app/api/session/[id]/message/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession, saveSession } from "@/lib/storage";
import {
  analyzeTraineeMessage,
  shouldAdvanceState,
  getNextState,
  shouldEnterOutcomeState,
  buildAttendeePrompt,
  hasExceededTurnLimit,
  detectSelfServiceCues,
  detectMQLCues,
  detectDeferredInterestCues,
  detectStakeholderType,
  determineOutcome,
  determineBandedOutcome,
  isWinOutcome,
  SIMULATOR_CONFIG,
} from "@/lib/simulator";
import { randomUUID } from "crypto";
import { getChatProvider, MockChatProvider } from "@/lib/llm/chatProvider";
import type { ChatInput } from "@/lib/llm/chatTypes";
import { withSpan, withChildSpan } from "@/lib/telemetry";
import { getEnrichment, saveEnrichment } from "@/lib/llm/enrichmentStore";
import { getEnrichmentProvider } from "@/lib/llm/provider";
import type { EnrichmentInput } from "@/lib/llm/enrichmentTypes";
import { composeAttendeeSystemPrompt } from "@/lib/llm/promptComposer";
import type { PromptRuntimeContext } from "@/lib/llm/promptBundleTypes";
import { getInviteForSession } from "@/lib/invites";
import { scoreSession } from "@/lib/scoring";
import { saveScore } from "@/lib/scoreStore";
import { addToLeaderboardIndex } from "@/lib/leaderboardStore";
import { getOutcomeAction, shouldShowCompletionCTA } from "@/lib/outcomeActions";
import { generateAttendeeReply } from "@/lib/attendee/generateAttendeeReply";
import { postProcessAttendeeText } from "@/lib/attendee/postProcess";
import { detectCommittedOutcome } from "@/lib/outcomeCommitment";
import { isEvaluationQuestion } from "@/lib/outcomeEvaluation";

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

        if (session.kickoff.personaId) {
          span.setAttribute("persona_id", session.kickoff.personaId);
        }
        if (session.kickoff.traineeId) {
          span.setAttribute("trainee_id", session.kickoff.traineeId);
        }
        span.setAttribute("current_state", session.currentState);

        // On-demand enrichment: if missing, try to load from cache or generate
        if (!session.kickoff.enrichment && session.kickoff.personaId) {
          try {
            const cacheKey = `persona:${session.kickoff.personaId}`;
            let enrichment = await getEnrichment(
              cacheKey,
              session.kickoff.personaId
            );

            // If not in cache, generate on-demand (this CAN block message, but invite was fast)
            if (!enrichment && session.kickoff.attendeeProfile) {
              console.log("[message] Generating enrichment on-demand for session:", id);

              const provider = getEnrichmentProvider();
              const enrichmentInput: EnrichmentInput = {
                conferenceId: cacheKey,
                personaId: session.kickoff.personaId,
                conferenceContext: "Tech conference booth",
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

        // 3a) Check turn limits
        const traineeMessageCount = session.transcript.filter((m) => m.type === "trainee").length;
        const turnLimitExceeded = hasExceededTurnLimit(traineeMessageCount);

        if (turnLimitExceeded) {
          span.setAttribute("turn_limit_exceeded", true);
          span.setAttribute("trainee_turns", traineeMessageCount);
        }

        // 3b) Detect self-service cues
        const selfServiceDetected = detectSelfServiceCues(message);
        if (selfServiceDetected) {
          span.setAttribute("self_service_cues_detected", true);
        }

        // 3c) Detect MQL cues with detailed matching (now includes near-term intent)
        const mqlResult = detectMQLCues(message);
        if (mqlResult.detected) {
          span.setAttribute("mql_cues_detected", true);
          span.setAttribute("mql_matched_cues", mqlResult.matched.join(", "));
          span.setAttribute("mql_match_count", mqlResult.matched.length);
          span.setAttribute("mql_near_term_intent", mqlResult.hasNearTermIntent);
        }

        // 3d) Detect deferred interest cues
        const deferredInterestDetected = detectDeferredInterestCues(message);
        if (deferredInterestDetected) {
          span.setAttribute("deferred_interest_cues_detected", true);
        }

        // 3e) Detect stakeholder type from persona + transcript signals
        // Build recent transcript for analysis (last 3 messages)
        const recentTranscript = session.transcript
          .slice(-3)
          .map((m) => m.text)
          .join(" ");
        const stakeholderType = detectStakeholderType(
          session.kickoff.attendeeProfile,
          recentTranscript
        );
        if (stakeholderType !== "unknown") {
          span.setAttribute("stakeholder_type", stakeholderType);
        }

        // 4) Build conversation history for ChatProvider (excluding system messages)
        const conversationHistory = session.transcript
          .filter((m) => m.type !== "system")
          .map((m) => ({
            role: m.type === "trainee" ? ("user" as const) : ("assistant" as const),
            content: m.text,
          }));

        span.setAttribute("conversation_length", conversationHistory.length);

        // 5) Generate attendee response (template-based with LLM fallback)
        let attendeeResponseText: string = "";
        let chatMeta: { provider: string; model?: string } | undefined;
        let attendeeReplySource: "template" | "llm" = "llm";
        let attendeeIntent: string | undefined;
        let attendeeIntentConfidence: number | undefined;

        // Count trainee turns for deterministic variant selection
        const traineeTurnCount = session.transcript.filter((m) => m.type === "trainee").length;

        // Try template-based response first
        const templateResult = generateAttendeeReply({
          traineeText: message,
          session,
          traineeTurnCount,
        });

        if (templateResult) {
          // Use template-based response
          attendeeResponseText = templateResult.text;
          attendeeReplySource = templateResult.source;
          attendeeIntent = templateResult.intent;
          attendeeIntentConfidence = templateResult.confidence;

          // Track expressed intent (for exhaustion prevention)
          if (attendeeIntent && attendeeIntentConfidence && attendeeIntentConfidence >= 0.8) {
            if (!session.expressedIntents) {
              session.expressedIntents = [];
            }
            if (!session.expressedIntents.includes(attendeeIntent)) {
              session.expressedIntents.push(attendeeIntent);
            }
          }

          span.setAttribute("attendee_reply_source", attendeeReplySource);
          if (attendeeIntent) {
            span.setAttribute("attendee_intent", attendeeIntent);
            span.setAttribute("attendee_intent_confidence", attendeeIntentConfidence || 0);
          }
        } else {
          // Fallback to LLM if template didn't match
          try {
          // Build prompt runtime context from session data
          // Parse attendee profile to extract structured fields
          const profileLines = session.kickoff.attendeeProfile.split("\n");
          const profileParsed: Record<string, string> = {};
          for (const line of profileLines) {
            const [key, ...valueParts] = line.split(":");
            if (key && valueParts.length > 0) {
              profileParsed[key.trim()] = valueParts.join(":").trim();
            }
          }

          const runtimeContext: PromptRuntimeContext = {
            persona: {
              title: profileParsed["Persona"] || "Unknown",
              modifiers: profileParsed["Modifiers"] || "None",
              emotionalPosture: profileParsed["Emotional posture"] || "Neutral",
              toolingBias: profileParsed["Tooling bias"] || "None specified",
              otelFamiliarity: profileParsed["OpenTelemetry familiarity"] || "Unknown",
            },
            enrichment: session.kickoff.enrichment || null,
            sessionState: session.currentState,
            trainerGuidance: session.trainerFeedback?.guidance || null,
            turnLimitExceeded,
            selfServiceCuesDetected: selfServiceDetected,
            mqlCuesDetected: mqlResult.detected,
            deferredInterestCuesDetected: deferredInterestDetected,
            stakeholderType,
          };

          // Compose system prompt using versioned bundle
          const composedPrompt = await composeAttendeeSystemPrompt(
            runtimeContext,
            conversationHistory
          );

          span.setAttribute("prompt_bundle_version", composedPrompt.bundleVersion);
          span.setAttribute("prompt_has_trainer_guidance", composedPrompt.hasTrainerGuidance);

          // Prepare chat input
          const chatInput: ChatInput = {
            systemPrompt: composedPrompt.content,
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

          attendeeResponseText = postProcessAttendeeText(result.text);
          attendeeReplySource = "llm";
          chatMeta = {
            provider: result.provider,
            model: result.model,
          };

          span.setAttribute("attendee_reply_source", attendeeReplySource);
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
            attendeeResponseText = postProcessAttendeeText(mockResult.text);
            attendeeReplySource = "llm";
            chatMeta = { provider: "mock (fallback)" };
            span.setAttribute("attendee_reply_source", attendeeReplySource);
            span.setAttribute("chat_provider", "mock_fallback");
          } catch (fallbackError) {
            // Ultimate fallback: use canned response
            console.error("[chat] Mock provider also failed:", fallbackError);
            attendeeResponseText = postProcessAttendeeText(pickMockResponse(session.currentState));
            attendeeReplySource = "llm";
            chatMeta = { provider: "canned (emergency fallback)" };
            span.setAttribute("attendee_reply_source", attendeeReplySource);
            span.setAttribute("chat_provider", "canned_emergency");
          }
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
        // CRITICAL: Gate OUTCOME state on attendee commitment (Fix 1)
        let stateAdvanced = false;

        // Detect commitment early (needed for OUTCOME gate check)
        let committedOutcomeForStateGate: string | null = null;
        if (session.currentState === "SOLUTION_FRAMING") {
          committedOutcomeForStateGate = detectCommittedOutcome(attendeeResponseText);
        }

        if (shouldAdvanceState(session.currentState, analysis)) {
          const nextState = getNextState(session.currentState);

          // Gate SOLUTION_FRAMING → OUTCOME transition on commitment
          if (session.currentState === "SOLUTION_FRAMING" && nextState === "OUTCOME") {
            // Only advance to OUTCOME if attendee committed
            if (shouldEnterOutcomeState({ committedOutcome: committedOutcomeForStateGate })) {
              session.stateHistory.push({
                from: session.currentState,
                to: nextState,
                timestamp: new Date().toISOString(),
              });
              session.currentState = nextState;
              stateAdvanced = true;

              span.setAttribute("state_advanced", true);
              span.setAttribute("new_state", nextState);
              span.setAttribute("outcome_gate_passed", true);
            } else {
              // Stay in SOLUTION_FRAMING until commitment detected
              span.setAttribute("state_advanced", false);
              span.setAttribute("outcome_gate_blocked", "no_commitment");
            }
          } else if (nextState !== session.currentState) {
            // All other state transitions work normally
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

        // 8) Detect outcome and prepare completion CTA (NO AUTO-END)
        // Check for outcomes in SOLUTION_FRAMING and OUTCOME states
        let outcome = "UNKNOWN";
        let endPrompt = null;

        if (session.currentState === "OUTCOME" || session.currentState === "SOLUTION_FRAMING") {
          // Use banded outcome resolver if outcomeSeed is available
          if (session.outcomeSeed && session.kickoff.attendeeProfile) {
            // Build recent transcript for soft demo eligibility
            const recentTranscript = session.transcript
              .slice(-10)
              .map((m) => m.text)
              .join(" ");

            const result = determineBandedOutcome(
              session.currentState,
              mqlResult,
              selfServiceDetected,
              deferredInterestDetected,
              attendeeResponseText,
              recentTranscript,
              session.kickoff.attendeeProfile,
              session.outcomeSeed
            );

            outcome = result.outcome;

            // Store decision trace for transparency
            session.decisionTrace = {
              personaBandKey: result.personaBandKey,
              personaWeightsUsed: result.personaWeightsUsed,
              eligibleOutcomes: result.eligibleOutcomes,
              sampledOutcome: outcome !== "UNKNOWN" ? outcome : undefined,
              demoEligibilityScore: result.demoEligibilityScore,
              jitteredWeights: result.jitteredWeights,
              reason: result.reason
            };

            // Add telemetry for banded outcomes
            if (result.demoEligibilityScore !== undefined) {
              span.setAttribute("demo_eligibility_score", result.demoEligibilityScore);
            }
            if (result.personaBandKey) {
              span.setAttribute("persona_band_key", result.personaBandKey);
              span.setAttribute("persona_weights_used", result.personaWeightsUsed || false);
            }
            if (result.reason) {
              span.setAttribute("outcome_reason", result.reason);
            }
          } else {
            // Fallback to original determineOutcome
            outcome = determineOutcome(
              session.currentState,
              mqlResult,
              selfServiceDetected,
              deferredInterestDetected,
              attendeeResponseText
            );
          }

          span.setAttribute("outcome_detected", outcome);
          span.setAttribute("outcome_eligible", outcome !== "UNKNOWN");

          // COMMITMENT GATE: Only show CTA if attendee explicitly committed
          // Outcome eligibility (above) is used for scoring/telemetry only
          let committedOutcome = detectCommittedOutcome(attendeeResponseText);

          // EVALUATION QUESTION GATE (Fix 2): Block CTA on mid-funnel questions
          const isEvaluation = isEvaluationQuestion(attendeeResponseText);
          if (isEvaluation) {
            span.setAttribute("evaluation_question_detected", true);
            committedOutcome = null; // Force block
          }

          if (committedOutcome) {
            span.setAttribute("outcome_committed", committedOutcome);
            span.setAttribute("commitment_detected", true);
          }

          // Show CTA ONLY if commitment detected AND not evaluation question
          if (committedOutcome && shouldShowCompletionCTA(committedOutcome)) {
            const action = getOutcomeAction(committedOutcome);

            // Store pending outcome in session for UI restoration
            session.pendingOutcome = committedOutcome;
            session.pendingEndAction = {
              actionType: action.actionType,
              actionLabel: action.actionLabel,
            };

            endPrompt = {
              outcome: committedOutcome,
              actionLabel: action.actionLabel,
              actionType: action.actionType,
              tooltip: action.tooltip,
            };

            span.setAttribute("completion_cta_ready", true);
            span.setAttribute("completion_action", action.actionType);
          } else if (outcome !== "UNKNOWN") {
            // Outcome eligible but not committed yet
            span.setAttribute("completion_cta_ready", false);
            const blockReason = isEvaluation ? "evaluation_question" : "no_commitment";
            span.setAttribute("cta_blocked_reason", blockReason);

            // Add to decision trace
            if (session.decisionTrace) {
              session.decisionTrace.reason = blockReason;
            }
          }
        }

        // 9) Persist session
        await saveSession(session);

        span.setAttribute("status", 200);
        span.setAttribute("transcript_length", session.transcript.length);

        return NextResponse.json({
          message: attendeeMsg,
          currentState: session.currentState,
          violations: session.violations,
          chatMeta, // Provider metadata (optional, for debugging)
          detectedOutcome: outcome !== "UNKNOWN" ? outcome : undefined,
          endPrompt, // Completion CTA if outcome reached
          shouldSuggestEnd: endPrompt !== null,
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