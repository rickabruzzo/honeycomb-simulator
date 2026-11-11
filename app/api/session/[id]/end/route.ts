import { NextRequest, NextResponse } from 'next/server';
import { getSession, saveSession } from '@/lib/storage';
import { SIMULATOR_CONFIG } from '@/lib/simulator';
import { randomUUID } from 'crypto';
import { getInviteForSession, getInvite } from '@/lib/invites';
import { scoreSession } from '@/lib/scoring';
import { saveScore } from '@/lib/scoreStore';
import { addToLeaderboardIndex } from '@/lib/leaderboardStore';
import { getPersona, ensurePersonasSeeded } from '@/lib/personaStore';
import { buildPersonaTitle } from '@/lib/formatUtils';
import { withSpan } from '@/lib/telemetry';
import { outcomeSignalToCommittedOutcome } from '@/lib/attendee/outcomeSignals';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withSpan(
    "hc.event.session_end",
    async (span) => {
      const { id } = await params;

      span.setAttribute("route", "/api/session/[id]/end");
      span.setAttribute("method", "POST");
      span.setAttribute("event_type", "session_end");
      span.setAttribute("session_id", id);

      try {
        const session = await getSession(id);
        if (!session) {
          span.setAttribute("status", 404);
          span.setAttribute("error", "session_not_found");
          return NextResponse.json(
            { error: 'Session not found' },
            { status: 404 }
          );
        }

        session.active = false;

        span.setAttribute("final_state", session.currentState);
        span.setAttribute("violations_count", session.violations.length);
        span.setAttribute("transcript_length", session.transcript.length);
        span.setAttribute("state_transitions", session.stateHistory.length);

        // Calculate session duration
        const duration = Math.floor(
          (new Date().getTime() - new Date(session.startTime).getTime()) / 1000
        );

        span.setAttribute("session_duration_sec", duration);

        // Outcome: prefer the outcome the conversation actually reached (commitment detection /
        // transcript signal) over the regex-gated state machine. The state machine used to decide
        // this alone, so a trainee whose attendee said "Sure, that's probably the right move" to a
        // technical handoff was told DEFERRED_INTEREST, and a badge scan that ended in
        // PAIN_DISCOVERY read as an early exit.
        const states = Object.keys(SIMULATOR_CONFIG.states);
        const reached = states.indexOf(session.currentState);
        const total = states.length - 1;

        let outcome: string = session.pendingOutcome || "";
        if (!outcome && session.detectedOutcome?.type) {
          outcome = outcomeSignalToCommittedOutcome(session.detectedOutcome.type) ?? "";
        }
        if (!outcome) {
          if (session.currentState === "OUTCOME") outcome = "DEMO_READY";
          else if (session.currentState === "SOLUTION_FRAMING") outcome = "DEFERRED_INTEREST";
          else outcome = "NO_NEXT_STEP";
        }

        span.setAttribute("outcome", outcome);
        span.setAttribute("states_reached", reached);
        span.setAttribute("states_total", total);

        // Score first, so the feedback text tells the trainee the same story as their scorecard.
        let token: string | null = null;
        try {
          token = await getInviteForSession(id);
          if (!token) {
            const body = await request.json().catch(() => ({}));
            token = body.token || null;
          }
        } catch (e) {
          console.warn('Failed to resolve token for scoring:', e);
        }

        let scoreRecord: Awaited<ReturnType<typeof scoreSession>> | null = null;
        if (token) {
          try {
            scoreRecord = await scoreSession(session, token);
          } catch (e) {
            console.error('Failed to score session:', e);
          }
        }

        const OUTCOME_TEXT: Record<string, string> = {
          MQL_READY: "Badge scan / sales follow-up",
          DEMO_READY: "Demo / technical handoff",
          SELF_SERVICE_READY: "Self-service (postcard)",
          DEFERRED_INTEREST: "Interested, no next step set yet",
          POLITE_EXIT: "Polite exit",
          NO_NEXT_STEP: "Ended before a next step",
        };

        const wins = scoreRecord?.highlights ?? [];
        const fixes = [
          ...(scoreRecord?.mistakes ?? []),
          ...session.violations.map((v) => `Rule check: ${v}`),
        ];

        const feedback = [
          "━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
          "SESSION FEEDBACK",
          "━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
          "",
          `⏱️  Duration: ${Math.floor(duration / 60)}m ${duration % 60}s`,
          `🎯 Outcome: ${OUTCOME_TEXT[outcome] ?? outcome}`,
          scoreRecord ? `📊 Score: ${scoreRecord.score} (${scoreRecord.grade})` : "",
          "",
          scoreRecord?.summary ? `📈 Coach's take:\n${scoreRecord.summary}\n` : "",
          wins.length ? `✅ What worked:\n${wins.map((w) => "• " + w).join("\n")}\n` : "",
          fixes.length ? `⚠️  Next time:\n${fixes.map((f) => "• " + f).join("\n")}\n` : "",
          "Remember: Listen, discover pain, validate, then align to outcomes.",
        ]
          .filter((line, i, arr) => line !== "" || arr[i - 1] !== "")
          .join("\n")
          .trim();

    const feedbackMsg = {
      id: randomUUID(),
      type: 'system' as const,
      text: feedback,
      timestamp: new Date().toISOString()
    };
    session.transcript.push(feedbackMsg);

    await saveSession(session);

        // If we have a token, compute and save score
        let shareUrl: string | null = null;
        let scoreData = null;
        if (token && scoreRecord) {
          span.setAttribute("has_token", true);
          try {
            await saveScore(scoreRecord);
            shareUrl = `/share/${token}`;
            scoreData = {
              score: scoreRecord.score,
              grade: scoreRecord.grade,
              breakdown: scoreRecord.breakdown,
            };

            span.setAttribute("score", scoreRecord.score);
            span.setAttribute("grade", scoreRecord.grade);

        // Add to leaderboard index with full metadata
        // Resolve persona data from invite
        let personaId: string | null = null;
        let personaDisplayName: string | null = null;
        let jobTitle: string | null = null;

        try {
          // Ensure stores are seeded before lookups
          await ensurePersonasSeeded();

          const invite = await getInvite(token);
          if (invite) {
            // Get persona data
            if (invite.personaId) {
              personaId = invite.personaId;
              const persona = await getPersona(invite.personaId);
              if (persona) {
                personaDisplayName = buildPersonaTitle(
                  persona.personaType,
                  persona.modifiers,
                  persona.toolingBias
                );
                jobTitle = persona.personaType;
              }
            }
          }
        } catch (e) {
          console.warn('Failed to resolve leaderboard metadata:', e);
        }

            await addToLeaderboardIndex({
              token: scoreRecord.token,
              score: scoreRecord.score,
              grade: scoreRecord.grade,
              createdAt: scoreRecord.completedAt,
              personaId,
              personaDisplayName,
              jobTitle,
              // Trainee snapshot from score record
              traineeId: scoreRecord.traineeId || null,
              traineeNameShort: scoreRecord.traineeNameShort || null,
              trainingWheels: scoreRecord.trainingWheels,
            });
          } catch (e) {
            console.error('Failed to save score:', e);
          }
        } else {
          span.setAttribute("has_token", false);
        }

        span.setAttribute("status", 200);

        return NextResponse.json({
          ok: true,
          feedback: feedbackMsg,
          outcome,
          stateProgress: { reached, total },
          violations: session.violations,
          shareUrl,
          score: scoreData,
        });
      } catch (error) {
        console.error('End session error:', error);

        span.setAttribute("status", 500);
        span.setAttribute("error_message", error instanceof Error ? error.message : "Unknown error");

        return NextResponse.json(
          { error: 'Failed to end session' },
          { status: 500 }
        );
      }
    },
    { route: "/api/session/[id]/end", method: "POST", event_type: "session_end" }
  );
}