import config from '../simulator.config.json';

export const SIMULATOR_CONFIG = config;

export function analyzeTraineeMessage(text: string, currentState: string) {
  const lower = text.toLowerCase();
  const issues: string[] = [];
  
  // Check banned keywords
  SIMULATOR_CONFIG.keyword_restrictions.banned_product_keywords.forEach(keyword => {
    if (lower.includes(keyword.toLowerCase())) {
      issues.push(`Used banned keyword: "${keyword}"`);
    }
  });
  
  // Early pitch detection
  if (lower.includes('honeycomb') || lower.includes('our product') || lower.includes('our platform')) {
    if (currentState === 'ICEBREAKER') {
      issues.push('Early pitch detected in ICEBREAKER state');
    }
  }
  
  // OTel assumption
  if ((lower.includes('opentelemetry') || lower.includes('otel')) && 
      !lower.includes('?') && !lower.includes('familiar')) {
    issues.push('Assumed OTel familiarity without asking');
  }
  
  const isQuestion = text.includes('?');
  const isOpenEnded = /what|how|tell me|describe|walk me through/i.test(text);
  const isEmpathetic = /understand|hear|sounds like|that must|frustrat/i.test(text);
  
  return { issues, isQuestion, isOpenEnded, isEmpathetic };
}

export function shouldAdvanceState(
  currentState: string,
  analysis: ReturnType<typeof analyzeTraineeMessage>
): boolean {
  if (analysis.issues.length > 0) return false;
  
  switch (currentState) {
    case 'ICEBREAKER':
      return analysis.isQuestion && analysis.isOpenEnded;
    case 'EXPLORATION':
      return analysis.isOpenEnded;
    case 'PAIN_DISCOVERY':
      return analysis.isEmpathetic;
    case 'SOLUTION_FRAMING':
      return true; // Can advance to outcome
    default:
      return false;
  }
}

export function getNextState(currentState: string): string {
  const states = Object.keys(SIMULATOR_CONFIG.states);
  const currentIndex = states.indexOf(currentState);
  if (currentIndex < states.length - 1) {
    return states[currentIndex + 1];
  }
  return currentState;
}

export function buildAttendeePrompt(
  currentState: string,
  attendeeProfile: string,
  difficulty: string,
  conversationHistory: Array<{ role: string; content: string }>
): string {
  const stateConfig = SIMULATOR_CONFIG.states[currentState as keyof typeof SIMULATOR_CONFIG.states];
  
  return `You are roleplaying as a tech conference attendee at the Honeycomb booth. 

CRITICAL INSTRUCTIONS:
- You are ONLY the attendee, not the trainer/salesperson
- Never break character or mention you're an AI
- Never disclose your persona details or OTel level unless naturally earned through conversation
- Never volunteer pain points unprompted - they must be discovered through good questioning
- State-controlled behavior: ${currentState}

YOUR HIDDEN PROFILE (do not reveal directly):
${attendeeProfile}

CURRENT STATE: ${currentState}
State Description: ${stateConfig.description}
Your behavior: ${stateConfig.attendee_behavior.join(', ')}

DIFFICULTY: ${difficulty}

CONVERSATION RULES:
${Object.entries(SIMULATOR_CONFIG.conversation_rules).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

BANNED KEYWORDS (if trainer uses these, you become skeptical):
${SIMULATOR_CONFIG.keyword_restrictions.banned_product_keywords.join(', ')}

Respond naturally as the attendee. Keep responses brief (1-3 sentences max). Show appropriate skepticism, curiosity, or engagement based on the current state and how well the trainer is performing discovery.`;
}