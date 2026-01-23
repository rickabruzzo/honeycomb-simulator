import { NextRequest, NextResponse } from 'next/server';
import { saveSession, SessionState } from '@/lib/storage';
import { getPersonaById } from "@/lib/personas";
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // New: allow starting from personaId
    let conferenceContext: string | undefined = body.conferenceContext;
    let attendeeProfile: string | undefined = body.attendeeProfile;
    let difficulty: "easy" | "medium" | "hard" | undefined = body.difficulty;
    let personaId: string | undefined = body.personaId;

    if (personaId) {
      const preset = getPersonaById(personaId);
      if (!preset) {
        return new Response(
          JSON.stringify({ error: `Unknown personaId: ${personaId}` }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      conferenceContext = preset.conferenceContext;
      attendeeProfile = preset.attendeeProfile;
      difficulty = preset.difficulty;
    }

    // Validate (works for both personaId and manual mode)
    if (!conferenceContext?.trim() || !attendeeProfile?.trim() || !difficulty) {
      return new Response(
        JSON.stringify({
          error:
            "Missing required fields. Provide personaId OR conferenceContext + attendeeProfile + difficulty.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const sessionId = randomUUID();
    const now = new Date().toISOString();

    const session: SessionState = {
      id: sessionId,
      currentState: 'ICEBREAKER',
      stateHistory: [],
      transcript: [
        {
          id: randomUUID(),
          type: 'system',
          text: `Session started at ${conferenceContext}. Current state: ICEBREAKER`,
          timestamp: now
        },
        {
          id: randomUUID(),
          type: 'attendee',
          text: '*approaches booth casually*',
          timestamp: now
        }
      ],
      violations: [],
      kickoff: {
        conferenceContext,
        attendeeProfile,
        difficulty,
        personaId, // ✅ store it (may be undefined for manual mode)
      },
      startTime: now,
      active: true
    };

    await saveSession(session);

    return NextResponse.json({
      sessionId,
      transcript: session.transcript,
      currentState: session.currentState
    });
  } catch (error) {
    console.error('Start session error:', error);
    return NextResponse.json(
      { error: 'Failed to start session' },
      { status: 500 }
    );
  }
}