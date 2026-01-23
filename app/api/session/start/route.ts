import { NextRequest, NextResponse } from 'next/server';
import { saveSession } from '@/lib/storage';
import { createSession } from '@/lib/createSession';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const result = createSession({
      personaId: body.personaId,
      conferenceContext: body.conferenceContext,
      attendeeProfile: body.attendeeProfile,
      difficulty: body.difficulty,
    });

    if (result.error) {
      return new Response(
        JSON.stringify({ error: result.error }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const session = result.session;
    await saveSession(session);

    return NextResponse.json({
      sessionId: session.id,
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