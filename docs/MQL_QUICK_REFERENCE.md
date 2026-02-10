# MQL Detection Quick Reference

## Quick Commands

```bash
# Validate config JSON structure
npm run lint:json

# Test detection logic
npm run test:detection

# Full validation suite (JSON + tests + build)
npm run validate

# Development server
npm run dev
```

---

## MQL Cue Examples

### Badge Scan & Follow-Up
- "scan my badge"
- "follow up"
- "can someone follow up"
- "reach out after the conference"

### Pricing & Budget
- "pricing"
- "budget"
- "cost savings"
- "ROI"
- "I'd like to talk about cost"

### Leadership & Sales
- "talk to sales"
- "connect with sales"
- "let's talk offline"
- "schedule a call"

### IC Without Authority
- "I don't make the decision"
- "connect with my manager"
- "talk to my lead"
- "help me make the case"
- "advocate internally"

---

## Stakeholder Types

### Executive
**Titles:** CTO, VP, Director, Chief, Head of, Technical Buyer

**Priorities:**
- Budget & cost savings
- ROI & risk reduction
- Strategic alignment

**Preferred Outcome:** MQL_READY with sales/leadership follow-up

**Anti-Patterns:**
- Technical demos
- Deep dives
- Implementation details

### IC Without Authority
**Titles:** Engineer, Developer, SRE, IC, Senior Engineer, Staff Engineer

**Signals:**
- "I don't make the decision"
- "my manager"
- "my team lead"
- "I'll advocate"

**Preferred Outcome:** MQL_READY with manager/decision maker connection

---

## Grading Quick Reference

### MQL_READY Outcome

**Can achieve:** A, B, C, D
**Cannot receive:** F (excluded by design)

**Grade Boosters (A/B):**
- Early recognition of executive priorities
- Clean badge scan close within 1-2 turns
- Helping IC advocate internally
- Efficient convergence

**Grade Lowering:**
- Over-educating after MQL cues → C
- Forcing demos after MQL cues → D
- Ignoring authority boundaries → Lower grade

### Grading Distribution
- **A/B:** MQL closed cleanly, early stakeholder recognition, efficient
- **C:** Valid MQL outcome but inefficient (over-talking, late close)
- **D:** Missed clear MQL signals, continued pitching, forced demo
- **F:** IMPOSSIBLE for MQL_READY outcome

---

## Telemetry Attributes

### MQL Detection
```typescript
mql_cues_detected: boolean
mql_matched_cues: string (comma-separated)
mql_match_count: number
```

### Stakeholder Type
```typescript
stakeholder_type: "executive" | "ic_without_authority" | undefined
```

### Turn Limits
```typescript
turn_limit_exceeded: boolean
trainee_turns: number
```

### Other Key Attributes
```typescript
session_id: string
difficulty: string
current_state: string
conversation_length: number
violations_count: number
self_service_cues_detected: boolean
prompt_bundle_version: string
```

---

## File Locations

### Core Logic
- `lib/simulator.ts` - Detection functions
- `lib/simulator.config.json` - MQL cues, stakeholder types, grading
- `lib/llm/promptComposer.ts` - Prompt injection
- `app/api/session/[id]/message/route.ts` - Integration + telemetry

### Validation & Testing
- `scripts/validate-config.js` - JSON structure validation
- `scripts/test-mql-detection.js` - Detection logic tests

### Documentation
- `docs/MQL_AUDIT_SUMMARY.md` - Complete audit summary
- `docs/MQL_QUICK_REFERENCE.md` - This file

---

## Detection Flow

```
Trainee Message
    ↓
normalizeText(message)
    ↓
detectMQLCues(normalized) → { detected: boolean, matched: string[] }
    ↓
detectStakeholderType(persona, transcript) → "executive" | "ic_without_authority" | "unknown"
    ↓
Update span attributes (telemetry)
    ↓
Build runtimeContext with mqlCuesDetected + stakeholderType
    ↓
composeAttendeeSystemPrompt(context)
    ↓
Inject MQL convergence guidance (if detected)
    ↓
Inject stakeholder-specific guidance (if detected)
    ↓
Generate attendee response (LLM)
    ↓
Attendee converges to MQL_READY within 1-2 turns
```

---

## Common Scenarios

### Scenario 1: Executive Badge Scan
**Input:** "Interesting. Can you scan my badge? I'd like to talk about pricing."

**Detection:**
- MQL cues: scan badge, pricing/budget/roi
- Stakeholder: executive (from persona)

**Prompt Injection:**
- 🎯 MQL CUES DETECTED — CONVERGE NOW
- 👔 EXECUTIVE STAKEHOLDER DETECTED

**Expected Behavior:**
- Acknowledge positively
- Confirm badge scan
- Brief pricing mention
- Clean close (1 turn)

**Grade:** A/B

---

### Scenario 2: IC Needs Manager Buy-In
**Input:** "I love this but I don't make the decision. Can you follow up with my manager?"

**Detection:**
- MQL cues: IC without authority, connect with decision maker
- Stakeholder: ic_without_authority (from persona OR transcript)

**Prompt Injection:**
- 🎯 MQL CUES DETECTED — CONVERGE NOW
- 🔧 IC WITHOUT AUTHORITY DETECTED

**Expected Behavior:**
- Acknowledge their enthusiasm
- Offer to connect with manager
- Badge scan for follow-up
- Clean close (1-2 turns)

**Grade:** A/B

---

### Scenario 3: Post-MQL Over-Education (Bad)
**Input:** "Scan my badge and let's follow up."

**Trainee Response:** *Continues with 5-minute technical deep dive*

**Detection:**
- MQL cues detected
- Turn count increases
- No convergence

**Grade:** C (inefficient) or D (ignored signals)

---

## Success Criteria

✅ MQL_READY is always SUCCESS
✅ Equal to or better than DEMO_READY
✅ Converge within 1-2 turns after MQL cues
✅ Clean professional close
✅ No reopening discovery
✅ No demo pushing after MQL
✅ Stakeholder-aware approach

---

## Questions?

See full audit summary: `docs/MQL_AUDIT_SUMMARY.md`

Run tests: `npm run test:detection`

Validate config: `npm run lint:json`
