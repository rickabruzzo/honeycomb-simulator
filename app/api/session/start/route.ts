import { NextRequest, NextResponse } from 'next/server';
import { saveSession, SessionState } from '@/lib/storage';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { conferenceContext, attendeeProfile, difficulty } = body;
    
    if (!conferenceContext || !attendeeProfile || !difficulty) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
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
        difficulty
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