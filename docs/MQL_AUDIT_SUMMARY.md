# MQL/Stakeholder Detection Audit Summary

## Overview

Complete audit and enhancement of MQL (Marketing Qualified Lead) and stakeholder detection logic for the Honeycomb Simulator. All requested improvements have been implemented and tested.

**Status:** ✅ Complete
**Date:** 2026-01-28
**Build:** Passing
**Tests:** 12/12 passing

---

## 1. JSON Correctness ✅

### Validation Script
- **Location:** `scripts/validate-config.js`
- **NPM script:** `npm run lint:json`
- **Status:** All validation checks passing

### Structure Validation
- ✅ Valid JSON syntax
- ✅ All required top-level keys present
- ✅ State structure valid
- ✅ OUTCOME state with all required outcomes (DEMO_READY, SELF_SERVICE_READY, MQL_READY, POLITE_EXIT)
- ✅ MQL cues configured (23 cues)
- ✅ Stakeholder types configured (executive, ic_without_authority)
- ✅ Grading criteria valid with proper F-grade exclusions
- ✅ Turn limits configured (easy: 10, medium: 12, hard: 14)

### CI-Safe Check
Added npm scripts for continuous validation:
```json
{
  "lint:json": "node scripts/validate-config.js",
  "test:detection": "node scripts/test-mql-detection.js",
  "validate": "npm run lint:json && npm run test:detection && npm run build"
}
```

---

## 2. Detection Functions ✅

### Location
`lib/simulator.ts`

### Functions Implemented

#### `normalizeText(text: string): string`
Robust text normalization for pattern matching:
- Lowercase conversion
- Punctuation stripping (preserves spaces)
- Whitespace collapse

#### `detectMQLCues(text: string): { detected: boolean; matched: string[] }`
Enhanced MQL detection with:
- Normalized substring matching against config cues
- Pattern-based compound signal detection
- Returns matched cues for telemetry (truncated to 5)
- Supports 14+ pattern types including:
  - Badge scan requests
  - Sales/leadership follow-up
  - Pricing/budget inquiries
  - IC authority signals
  - Manager connection requests

#### `detectStakeholderType(personaProfile: string, transcript?: string): string`
Multi-source stakeholder detection:
- Persona profile title matching (executive vs IC)
- Runtime transcript signal detection
- Returns: "executive" | "ic_without_authority" | "unknown"
- Checks config-driven title lists and signals
- Pattern-based IC authority detection

---

## 3. Robust Cue Detection ✅

### Normalization Strategy
All text normalized before matching:
```typescript
text.toLowerCase()
  .replace(/[^\w\s]/g, ' ')  // Strip punctuation
  .replace(/\s+/g, ' ')       // Collapse spaces
  .trim()
```

### Detection Methods

**Exact Phrase Matching:**
- All 23 MQL cues from config
- Normalized substring matching

**Pattern Matching (14 patterns):**
```typescript
/scan\s+(my\s+)?badge/
/follow\s+up/
/talk\s+(to\s+|with\s+)?(sales|leadership|manager)/
/(don\s?t|do\s+not)\s+make\s+(the\s+)?decision/
/\b(pricing|budget|cost\s+savings?|roi)\b/
// ... and 9 more
```

### Return Structure
```typescript
{
  detected: boolean,
  matched: string[]  // Truncated to 5 for telemetry
}
```

---

## 4. Prompt Injection Behavior ✅

### Location
`lib/llm/promptComposer.ts:92-106`

### MQL Convergence Enforcement
When `context.mqlCuesDetected === true`:

```
🎯 MQL CUES DETECTED (HOT LEAD) — CONVERGE NOW

IMMEDIATE ACTIONS:
1. Acknowledge their request positively
2. Confirm the specific next step (badge scan / sales follow-up / manager intro)
3. Close the conversation cleanly within 1-2 turns
4. Do NOT reopen discovery, do NOT push for demo, do NOT over-educate

Example: "Perfect! Let me scan your badge and our team will follow up about [specific topic]. Thanks for stopping by!"
```

### Stakeholder-Specific Guidance

**Executive Detected:**
```
👔 EXECUTIVE STAKEHOLDER DETECTED
This attendee is an executive (CTO, VP, Director, Technical Buyer).
Executives rarely want technical demos. They care about budget, cost savings, ROI, and strategic alignment.
Do NOT push technical depth. Focus on business value and leadership follow-up.
Preferred outcome: MQL_READY with sales/leadership conversation.
```

**IC Without Authority:**
```
🔧 IC WITHOUT AUTHORITY DETECTED
This attendee is an Individual Contributor who may lack decision-making power.
They may love the product but need help advocating internally.
Offer to connect with their manager, team lead, or decision maker.
Badge scan + manager follow-up is a SUCCESS outcome (MQL_READY).
```

---

## 5. Outcome Convergence Rules ✅

### Behavior
- MQL cues trigger immediate convergence guidance
- Attendee converges within 1-2 turns:
  1. Acknowledge request
  2. Confirm next step
  3. Clean close
- No reopening discovery after MQL detection

### Config Rules
**From `lib/simulator.config.json`:**
```json
{
  "mql_grading_rules": {
    "success_criteria": "MQL_READY is always a success outcome",
    "grade_lowering": [
      "Over-educating after MQL cues should lower grade to C",
      "Forcing demos after MQL cues should lower grade to D"
    ],
    "grade_boosting": [
      "Early recognition of executive priorities boosts to A",
      "Clean badge scan close boosts to A/B"
    ]
  }
}
```

---

## 6. Grading Rules ✅

### Implementation
**Location:** `lib/simulator.config.json:173-207`

### Key Rules
- ✅ MQL_READY can never receive F grade
- ✅ SELF_SERVICE_READY can never receive F grade
- ✅ Pushing demo after MQL cues caps grade at D
- ✅ Over-educating after MQL cues caps grade at C
- ✅ Early MQL recognition boosts to A
- ✅ Clean badge scan close boosts to A/B

### Grading Criteria Structure
```json
{
  "A_B": {
    "description": "Demo offered at right time OR self-service offered appropriately OR MQL/badge-scan closed cleanly",
    "mql_specific": "Recognized executive/IC signals early, closed efficiently with follow-up path"
  },
  "F": {
    "exclusions": [
      "SELF_SERVICE_READY outcome can never receive F grade",
      "MQL_READY outcome can never receive F grade"
    ]
  }
}
```

---

## 7. Telemetry ✅

### Location
`app/api/session/[id]/message/route.ts:186-196`

### Span Attributes Added

#### MQL Detection
```typescript
span.setAttribute("mql_cues_detected", true);
span.setAttribute("mql_matched_cues", "pricing, budget, pricing/budget/roi");
span.setAttribute("mql_match_count", 3);
```

#### Stakeholder Type
```typescript
span.setAttribute("stakeholder_type", "executive" | "ic_without_authority");
```

#### Turn Limit Tracking
```typescript
span.setAttribute("turn_limit_exceeded", true);
span.setAttribute("trainee_turns", 14);
```

#### Self-Service Detection
```typescript
span.setAttribute("self_service_cues_detected", true);
```

#### Existing Attributes
- `session_id`
- `conference_id`
- `persona_id`
- `trainee_id`
- `difficulty`
- `current_state`
- `conversation_length`
- `violations_count`
- `prompt_bundle_version`
- `prompt_has_trainer_guidance`

---

## Testing

### Test Suite
**Location:** `scripts/test-mql-detection.js`

### Test Coverage
```
MQL Detection Tests: 6/6 passing
✅ Badge scan request
✅ Pricing inquiry
✅ IC without authority
✅ Executive - cost focus
✅ Self-service (not MQL) - negative test
✅ Demo interest (not MQL) - negative test

Stakeholder Detection Tests: 6/6 passing
✅ CTO (executive)
✅ VP Engineering (executive)
✅ Director (executive)
✅ SRE (IC)
✅ Senior Engineer (IC)
✅ IC revealed through conversation
```

### Run Tests
```bash
npm run test:detection  # Run detection tests
npm run lint:json       # Validate config JSON
npm run validate        # Full validation suite
```

---

## Files Modified

### Core Logic
- ✅ `lib/simulator.ts` - Enhanced detection functions with normalization
- ✅ `lib/simulator.config.json` - MQL cues, stakeholder types, grading rules
- ✅ `lib/llm/promptComposer.ts` - MQL convergence enforcement
- ✅ `app/api/session/[id]/message/route.ts` - Detection integration + telemetry

### Type Definitions
- ✅ `lib/llm/promptBundleTypes.ts` - Added mqlCuesDetected, stakeholderType fields

### Prompt Bundle
- ✅ `lib/llm/defaultPromptBundle.ts` - v1.2.0 with MQL guidance

### Validation & Testing
- ✅ `scripts/validate-config.js` - JSON structure validation
- ✅ `scripts/test-mql-detection.js` - Detection logic tests
- ✅ `package.json` - Added npm scripts

---

## Summary

All 7 audit requirements have been completed:

1. ✅ **JSON Correctness** - Valid structure with CI-safe validation script
2. ✅ **Detection Functions** - Robust functions with config-driven behavior
3. ✅ **Robust Cue Detection** - Normalized text matching with patterns
4. ✅ **Prompt Injection** - MQL convergence and stakeholder-specific guidance
5. ✅ **Outcome Convergence** - 1-2 turn close enforced in prompts
6. ✅ **Grading Rules** - F-grade exclusions, grade boosting/lowering
7. ✅ **Telemetry** - Comprehensive span attributes for all detection events

**Build Status:** ✅ Passing
**Test Status:** ✅ 12/12 passing
**Validation:** ✅ All checks passing

The MQL/stakeholder detection system is now production-ready with robust detection, proper grading rules, and comprehensive telemetry.
