# Booth Conversation Behavior Refinement (v1.4.0)

## Overview

Refined Claude's attendee behavior to be more realistic, persona-aware, and efficient. Addresses over-optimization of discovery behavior and improves outcome convergence.

**Status:** ✅ Complete
**Version:** v1.3.0 → v1.4.0
**Date:** 2026-01-29

---

## Problems Identified

From real session analysis:
1. **Over-generic discovery** - Attendee asks too many abstract questions
2. **Therapy-like listening** - Over-reflection, excessive parroting
3. **Wrong empathy for executives** - Emotional validation inappropriate for CTO/VP personas
4. **Too many questions** - Discovery continues even when attendee is engaged
5. **Slow MQL convergence** - Badge scan takes multiple turns to close
6. **Score gaming** - Model optimizes for question count vs. efficiency

---

## Refinements Implemented

### 1️⃣ Discovery Style (Tool-Adjacent & Concrete) ✅

**Location:** `lib/llm/defaultPromptBundle.ts`

**Added Section:**
```
DISCOVERY QUESTION STYLE (CRITICAL - MUST FOLLOW):
Your questions must be:
- Concrete and tool-adjacent
- Anchored to Honeycomb use cases
- Focused on evaluation, not philosophy

✅ PREFER (Realistic booth questions):
- "What are you using today for observability?"
- "Where does that break down?"
- "What's hardest during an incident?"
- "How do you debug cross-service issues now?"
- "What's your current metrics/logging setup?"

❌ AVOID (Abstract/generic):
- "How do teams usually approach this?"
- "What does good observability mean to you?"
- "How do you think about building confidence?"
- Career or team-dynamics advice
- Process consulting questions
```

**Impact:** Questions now evaluate Honeycomb fit, not philosophy.

---

### 2️⃣ Active Listening (Realistic, Not Therapy) ✅

**Added Guidance:**
```
ACTIVE LISTENING (REALISTIC, NOT THERAPY):
Demonstrate listening by:
1. ONE short summary of their pain ("Sounds like you're hitting alert
   fatigue with your current setup")
2. THEN advance the conversation toward Honeycomb's fit

DO NOT:
- Parrot language repeatedly
- Over-reflect feelings
- Turn this into therapy

Active listening ≠ emotional counseling. Keep it practical and brief.
```

**Before:**
```
Attendee: "We struggle with alert fatigue."
Trainee: "I hear you saying alert fatigue is really impacting your team..."
Attendee: "Yes, it's frustrating. We feel overwhelmed by noise."
Trainee: "I understand that feeling overwhelmed must be difficult..."
```

**After:**
```
Attendee: "We struggle with alert fatigue."
Trainee: "Sounds like you're hitting alert fatigue. What are you using today?"
Attendee: "Prometheus and Grafana."
Trainee: "Where does that break down for you?"
```

**Impact:** Listening is acknowledged briefly, then conversation advances.

---

### 3️⃣ Persona-Aware Empathy ✅

**Added Guidance:**
```
PERSONA-AWARE EMPATHY:
- IC personas (Engineer, SRE, Developer):
  • Emotional validation matters more
  • Can acknowledge frustration, stress, burnout
  • Brief empathy + validation works well

- Executive personas (CTO, VP, Director):
  • Empathy = acknowledging business impact + offering clarity
  • Focus on cost, risk, customer impact
  • Excessive emotional reflection is unnecessary and feels off
  • Keep it pragmatic and strategic
```

**Executive Example:**
```
Before ❌: "I understand how frustrating that must feel..."
After ✅: "Makes sense. Cost overruns from slow debugging are a real concern."
```

**IC Example:**
```
Before ✅: "That sounds really frustrating during an outage."
After ✅: "That sounds brutal. What's hardest during incidents?"
```

**Impact:** Empathy matches the persona's priorities and communication style.

---

### 4️⃣ Question Balance Rule (Max 1 Per State) ✅

**Added Rule:**
```
QUESTION BALANCE RULE:
- Maximum ONE open-ended discovery question per state
- After asking, let the trainee respond with context and differentiation
- If attendee is engaged and asking specifics, STOP asking discovery questions
- Shift to evaluation mode: answer their questions, compare to incumbents,
  discuss fit
```

**Before:**
```
State: PAIN_DISCOVERY
Attendee asks 3-4 questions: "What are you using?" "How do you handle...?"
"What about...?" "Do you also...?"
```

**After:**
```
State: PAIN_DISCOVERY
Attendee asks 1 question: "What are you using today?"
Trainee responds with context and comparison
Attendee shifts to evaluation: "How is Honeycomb different from Datadog?"
```

**Impact:** Less interrogation, more natural evaluation flow.

---

### 5️⃣ MQL Convergence (1-Turn Close) ✅

**Added Protocol:**
```
MQL CONVERGENCE PROTOCOL (MUST FOLLOW - 1 TURN CLOSE):
When attendee signals:
- Manager involvement
- Follow-up request
- Badge scan
- Offline discussion
- Pricing conversation

You MUST:
1. Acknowledge positively (brief, 1 sentence)
2. Confirm next step clearly
3. Close cleanly within 1 turn
4. NO additional discovery questions
5. NO demo push
6. NO reopening topics

Example: "Great, I'll scan your badge and our team will follow up about
pricing. Thanks for stopping by!"
```

**Before:**
```
Attendee: "Can you scan my badge?"
Trainee: "Absolutely! Let me scan that."
Attendee: "Before you do, what about pricing?"
Trainee: "Pricing varies based on volume..."
Attendee: "And how does setup work?"
[3-4 more exchanges]
```

**After:**
```
Attendee: "Can you scan my badge and follow up about pricing?"
Trainee: "Absolutely! I'll scan your badge and our team will reach out
about pricing. Thanks for stopping by!"
[Session ends with MQL_READY]
```

**Impact:** Clean 1-turn close for MQL outcomes.

---

### 6️⃣ Score Optimization Guidance ✅

**Added Internal Guidance:**
```
SUCCESS OPTIMIZATION (INTERNAL GUIDANCE):
The goal is to help trainees achieve A or B grades through:
✅ Efficient convergence (not prolonging unnecessarily)
✅ Correct outcome selection (DEMO_READY, SELF_SERVICE_READY, or MQL_READY)
✅ Persona-appropriate empathy (brief for executives, more for ICs)
✅ Realistic booth behavior (concrete questions, not philosophy)

DO NOT optimize for:
❌ Maximizing question count
❌ Prolonging pain discovery
❌ Over-reflecting emotions
❌ Abstract discussion

Best outcome: Trainee identifies your needs quickly, offers appropriate
next step, you accept clearly.
Realistic booth conversations are efficient, not exhaustive.
```

**Impact:** Model understands success = efficiency + correct outcome, not question count.

---

## File Modified

**`lib/llm/defaultPromptBundle.ts`**
- Added discovery question style guidance (concrete, tool-adjacent)
- Added active listening guidance (brief summary, not therapy)
- Added persona-aware empathy section
- Added question balance rule (max 1 per state)
- Added MQL convergence protocol (1-turn close)
- Added score optimization guidance
- Updated version: v1.3.0 → v1.4.0

---

## Behavior Matrix

### Discovery Questions

| Before (Generic) | After (Tool-Adjacent) |
|-----------------|----------------------|
| "How do teams usually approach this?" | "What are you using today for observability?" |
| "What does good observability mean?" | "Where does your current setup break down?" |
| "How do you build confidence?" | "What's hardest during an incident?" |

### Active Listening

| Before (Over-Reflection) | After (Brief Summary) |
|-------------------------|----------------------|
| "I hear you saying alert fatigue is really impacting you..." | "Sounds like alert fatigue. What are you using?" |
| "I understand that feeling overwhelmed..." | "That sounds brutal. Where does it break down?" |
| Multiple reflections per state | ONE summary, then advance |

### Empathy Style

| Persona | Before (One-Size) | After (Persona-Aware) |
|---------|------------------|----------------------|
| CTO/VP | "That must feel frustrating..." | "Cost overruns from slow debugging are a real concern." |
| Engineer/SRE | "I understand..." | "That sounds brutal during an outage." |

### Question Count

| State | Before | After |
|-------|--------|-------|
| PAIN_DISCOVERY | 3-4 questions | Max 1 question |
| Evaluation mode | Still asking discovery | Answering attendee's questions |

### MQL Close

| Scenario | Before | After |
|----------|--------|-------|
| Badge scan | 3-4 turn close | 1-turn close |
| Follow-up | Multiple exchanges | 1 acknowledgment + close |

---

## Acceptance Criteria Status

✅ Discovery questions are concrete and tool-adjacent
✅ Active listening is brief (1 summary), not therapy
✅ Empathy matches persona (pragmatic for execs, validating for ICs)
✅ Max 1 open-ended question per state
✅ MQL closes cleanly in 1 turn
✅ Score optimization favors efficiency, not question count

---

## Testing Scenarios

### Test 1: Tool-Adjacent Discovery
```bash
npm run dev
```

1. Start session
2. **Expected:** "What are you using for observability?"
3. **NOT expected:** "How do teams usually approach this?"

### Test 2: Brief Active Listening
1. Attendee mentions pain
2. **Expected:** One brief summary, then advance
3. **NOT expected:** Multiple reflections

### Test 3: Executive Empathy
1. Use CTO/VP persona
2. **Expected:** "Cost overruns are a concern" (pragmatic)
3. **NOT expected:** "That must feel frustrating" (emotional)

### Test 4: IC Empathy
1. Use Engineer/SRE persona
2. **Expected:** "That sounds brutal during outages" (validating)
3. **Expected:** Brief empathy is appropriate

### Test 5: Question Balance
1. Progress to PAIN_DISCOVERY
2. **Expected:** Max 1 discovery question
3. **Expected:** Then shift to evaluation mode

### Test 6: MQL 1-Turn Close
1. Attendee: "Scan my badge and follow up"
2. **Expected:** Single response confirming + close
3. **NOT expected:** Additional questions or discussion

---

## Prompt Bundle History

| Version | Date | Changes |
|---------|------|---------|
| v1.0.0 | Initial | Baseline prompt |
| v1.1.0 | Phase 2 | Self-service outcome, turn limits |
| v1.2.0 | Phase 3 | MQL outcome, stakeholder awareness |
| v1.2.1 | Bug fix | Conversation integrity, no exit after questions |
| v1.3.0 | Realism | Honeycomb-specific questions only |
| **v1.4.0** | **Refinement** | **Tool-adjacent discovery, persona-aware empathy, MQL 1-turn close** |

---

## Impact Summary

### Before v1.4.0
- Questions too abstract/generic
- Over-reflection (therapy style)
- Same empathy for all personas
- Too many questions per state
- MQL close takes 3-4 turns
- Optimizes for question count

### After v1.4.0
- Questions evaluate Honeycomb fit
- Brief listening summary, then advance
- Empathy matches persona (exec vs IC)
- Max 1 question per state
- MQL close in 1 turn
- Optimizes for efficiency + correct outcome

---

## Build Status

✅ **Build Passing**
✅ **No Errors**
✅ **v1.4.0 Deployed**

---

## Key Takeaways

1. **Discovery** = Evaluating Honeycomb, not seeking philosophy
2. **Listening** = Brief acknowledgment, not therapy
3. **Empathy** = Match persona (pragmatic for execs, validating for ICs)
4. **Questions** = Max 1 per state, then evaluate
5. **MQL** = 1-turn close, no reopening
6. **Success** = Efficiency + correct outcome, not question count

**Status:** ✅ **COMPLETE**

Claude now behaves like a realistic conference attendee evaluating a vendor solution, not a coaching client seeking personal development advice.
