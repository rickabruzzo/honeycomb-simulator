import { NextRequest, NextResponse } from 'next/server';
import { getSession, saveSession } from '@/lib/storage';
import { analyzeTraineeMessage, shouldAdvanceState, getNextState, buildAttendeePrompt } from '@/lib/simulator';
import { randomUUID } from 'crypto';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession(params.id);
    if (!session || !session.active) {
      return NextResponse.json(
        { error: 'Session not found or inactive' },
        { status: 404 }
      );
    }
    
    const { message } = await request.json();
    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }
    
    // Add trainee message to transcript
    const traineeMsg = {
      id: randomUUID(),
      type: 'trainee' as const,
      text: message,
      timestamp: new Date().toISOString()
    };
    session.transcript.push(traineeMsg);
    
    // Analyze the message
    const analysis = analyzeTraineeMessage(message, session.currentState);
    
    // Track violations
    if (analysis.issues.length > 0) {
      session.violations.push(...analysis.issues);
    }
    
    // Build conversation history for Claude
    const conversationHistory = session.transcript
      .filter(m => m.type !== 'system')
      .map(m => ({
        role: m.type === 'trainee' ? 'user' : 'assistant',
        content: m.text
      }));
    
    // Call Claude API
    const attendeePrompt = buildAttendeePrompt(
      session.currentState,
      session.kickoff.attendeeProfile,
      session.kickoff.difficulty,
      conversationHistory
    );
    
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: attendeePrompt,
        messages: [
          ...conversationHistory,
          { role: 'user', content: message }
        ]
      })
    });
    
    if (!response.ok) {
      throw new Error(`Claude API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    const attendeeResponse = data.content[0].text;
    
    // Add attendee response
    const attendeeMsg = {
      id: randomUUID(),
      type: 'attendee' as const,
      text: attendeeResponse,
      timestamp: new Date().toISOString()
    };
    session.transcript.push(attendeeMsg);
    
    // Check if state should advance (server-side decision only)
    if (shouldAdvanceState(session.currentState, analysis)) {
      const nextState = getNextState(session.currentState);
      if (nextState !== session.currentState) {
        session.stateHistory.push({
          from: session.currentState,
          to: nextState,
          timestamp: new Date().toISOString()
        });
        session.currentState = nextState;
      }
    }
    
    await saveSession(session);
    
    return NextResponse.json({
      message: attendeeMsg,
      currentState: session.currentState,
      violations: session.violations
    });
  } catch (error) {
    console.error('Message error:', error);
    return NextResponse.json(
      { error: 'Failed to process message' },
      { status: 500 }
    );
  }
}