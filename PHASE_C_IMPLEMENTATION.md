# Phase C: Token-Based Scoring + Share Page - Implementation Summary

## Files Created

### 1. lib/scoring.ts
Heuristic-based scoring engine (no LLM required):
- `ScoreRecord` type definition with score (0-100), grade (A-F), breakdown, highlights, mistakes
- `scoreSession()` function that analyzes:
  - **Listening** (0-20): Reflection phrases like "what I'm hearing", "sounds like"
  - **Discovery** (0-20): Open-ended questions vs statements
  - **Empathy** (0-20): Validation phrases like "that must be", "frustrating"
  - **OTel Assumptions** (0-20): Penalties for mentioning OTel without questions
  - **Guardrails** (0-20): Penalties for violations and early pitches
- Generates 3-6 highlights and 3-6 mistakes based on patterns

### 2. lib/scoreStore.ts
Score storage with KV + in-memory fallback:
- `saveScore()` - Stores score under `score:{token}` key
- `getScore()` - Retrieves score by token

### 3. app/api/share/[token]/route.ts
GET endpoint to fetch scores:
- Returns `ScoreRecord` for given token
- 404 if not found
- Does NOT include attendeeProfile (not in ScoreRecord)

### 4. app/share/[token]/page.tsx
Shareable scorecard page:
- Displays grade badge with color coding (A=green, B=blue, etc.)
- Score breakdown with progress bars for each category
- Highlights and mistakes in separate sections
- "Practice Again" button to return home
- Friendly error for missing scores

## Files Modified

### 5. app/api/session/[id]/end/route.ts
Updated to compute and save scores:
- Attempts to resolve token via `getInviteForSession()`
- Falls back to request body `{ token }` if not found
- Calls `scoreSession()` and `saveScore()` if token exists
- Returns `shareUrl: "/share/{token}"` and basic score data

### 6. app/s/[token]/page.tsx
Trainee page now redirects to scorecard:
- Passes `token` in POST body when ending session
- Redirects to `data.shareUrl` after 1s delay (shows feedback first)
- Uses `useRouter` for navigation

## How It Works

1. **Trainee completes session** at `/s/{token}`
2. **Clicks "End Session"** → POST to `/api/session/{id}/end` with token
3. **Backend computes score** using heuristic analysis
4. **Score saved** to KV/memory under `score:{token}`
5. **Response includes** `shareUrl: "/share/{token}"`
6. **Trainee redirected** to shareable scorecard page
7. **Scorecard displays** grade, breakdown, highlights, mistakes

## Security

✅ **No attendeeProfile exposure**: `ScoreRecord` only includes:
- `conferenceContext` (visible context)
- `difficulty` and `personaId` (metadata)
- Score metrics (computed from behavior, not profile)

❌ **NOT included**: `attendeeProfile` (hidden profile never sent to client)

## Manual Test Instructions

### Test 1: Create invite and complete session
```javascript
// 1. In browser at http://localhost:3000
// 2. Click "Create Link" or use console:
fetch('/api/invite/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ personaId: 'eager-newbie' })
}).then(r => r.json()).then(console.log)

// 3. Copy the URL (e.g., /s/abc-123-def)
```

### Test 2: Practice session and end
1. Visit the trainee URL: `http://localhost:3000/s/{token}`
2. Exchange 3-5 messages:
   - Use some open-ended questions: "What challenges are you facing?"
   - Show empathy: "That sounds frustrating"
   - Reflect: "So what I'm hearing is..."
3. Click **"End Session"**
4. Wait 1 second for feedback message
5. **Verify redirect** to `/share/{token}`

### Test 3: Verify scorecard
After redirect, confirm:
- ✅ Grade displayed (A/B/C/D/F)
- ✅ Score out of 100 shown
- ✅ Breakdown shows 5 categories with bars
- ✅ Highlights section populated
- ✅ Mistakes section populated
- ✅ "Practice Again" button works
- ✅ Conference context shown (if available)

### Test 4: Direct share link access
1. Copy the share URL from browser: `http://localhost:3000/share/{token}`
2. Open in new tab or incognito window
3. **Verify score loads** without needing session
4. Confirm **no attendeeProfile visible** anywhere

### Test 5: Invalid token
1. Visit `http://localhost:3000/share/invalid-token-123`
2. **Expected**: "Score Not Found" error with "Back to Home" button

### Test 6: Verify API
```javascript
// In browser console with valid token
fetch('/api/share/{your-token}')
  .then(r => r.json())
  .then(console.log)

// Expected: ScoreRecord object with score, grade, breakdown
// Confirm: NO attendeeProfile field
```

### Test 7: Scoring accuracy
Complete a session with:
- **Good behavior**: Open questions, empathy, reflection
- **Bad behavior**: Early pitch, OTel assumptions, banned keywords

Verify:
- Good behavior → Higher score, more highlights
- Bad behavior → Lower score, more mistakes, violations listed

### Test 8: Existing trainer UI
1. Visit `http://localhost:3000/`
2. Start session manually (not via invite)
3. End session
4. **Expected**: Works as before, no redirect (no token available)

## Scoring Heuristics

### Listening (0-20)
- Base: 5 points
- +5 per reflection phrase detected
- Phrases: "what i'm hearing", "sounds like", "so you're saying", "if i understand", "let me make sure", "to clarify", "help me understand"

### Discovery (0-20)
- +2 per question (contains "?")
- +3 per open-ended phrase
- Phrases: "what", "how", "tell me", "describe", "walk me through", "help me understand"

### Empathy (0-20)
- Base: 2 points
- +4 per empathy phrase
- Phrases: "that must be", "frustrating", "i can imagine", "sorry", "understand", "hear you", "that's tough", "that sounds", "rough", "brutal"

### OTel Assumptions (0-20)
- Start: 20 points
- -10 per mention of "opentelemetry" or "otel" without "?"

### Guardrails (0-20)
- Start: 20 points
- -5 per violation
- -5 extra for "Early pitch detected in ICEBREAKER state"

### Grade Mapping
- A: 90-100
- B: 80-89
- C: 70-79
- D: 60-69
- F: 0-59

## Next Steps (Future Phases)

- Phase D: Leaderboard aggregating scores by persona/difficulty
- Phase E: LLM-enhanced feedback and coaching tips
- Phase F: Team/cohort analytics
