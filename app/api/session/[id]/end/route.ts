import { NextRequest, NextResponse } from 'next/server';
import { getSession, saveSession } from '@/lib/storage';
import { SIMULATOR_CONFIG } from '@/lib/simulator';
import { randomUUID } from 'crypto';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession(params.id);
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }
    
    session.active = false;
    
    // Calculate session duration
    const duration = Math.floor(
      (new Date().getTime() - new Date(session.startTime).getTime()) / 1000
    );
    
    // Generate feedback
    const states = Object.keys(SIMULATOR_CONFIG.states);
    const reached = states.indexOf(session.currentState);
    const total = states.length - 1;
    
    let outcome = 'POLITE_EXIT';
    if (session.currentState === 'OUTCOME') outcome = 'DEMO_READY';
    else if (session.currentState === 'SOLUTION_FRAMING') outcome = 'DEFERRED_INTEREST';
    
    const feedback = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSION FEEDBACK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⏱️  Duration: ${Math.floor(duration / 60)}m ${duration % 60}s
🎯 Outcome: ${outcome}
📊 State Progress: ${reached}/${total}

✅ What You Did Well:
${session.violations.length === 0 ? '• Maintained discipline with product keywords' : ''}
${session.stateHistory.length > 0 ? '• Successfully advanced the conversation through ' + session.stateHistory.length + ' state(s)' : ''}

⚠️  Where You Could Improve:
${session.violations.length > 0 ? session.violations.map(v => '• ' + v).join('\n') : ''}
${reached < 3 ? '• Focus on discovery before solution framing' : ''}

🎭 Persona Alignment:
Hidden profile was used to generate responses appropriate to difficulty level: ${session.kickoff.difficulty}

📈 Overall Assessment:
${outcome === 'DEMO_READY' ? 'Strong execution! You earned genuine interest.' : outcome === 'DEFERRED_INTEREST' ? 'Good progress. More discovery could have sealed it.' : 'Conversation ended early. Review failure modes.'}

State Transitions:
${session.stateHistory.map(h => `${h.from} → ${h.to}`).join('\n') || 'None'}

Remember: Listen, discover pain, validate, then align to outcomes.
    `.trim();
    
    const feedbackMsg = {
      id: randomUUID(),
      type: 'system' as const,
      text: feedback,
      timestamp: new Date().toISOString()
    };
    session.transcript.push(feedbackMsg);
    
    await saveSession(session);
    
    return NextResponse.json({
      feedback: feedbackMsg,
      outcome,
      stateProgress: { reached, total },
      violations: session.violations
    });
  } catch (error) {
    console.error('End session error:', error);
    return NextResponse.json(
      { error: 'Failed to end session' },
      { status: 500 }
    );
  }
