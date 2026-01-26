# Phase J1: Trainer Session Review Implementation

## Overview
Phase J1 adds a trainer-facing session review page that allows trainers to replay trainee session transcripts. This is a read-only view showing the full conversation history with timestamps and session metadata.

## Features Delivered

### 1. Session Review Page
- **Route**: `/review/[token]`
- **Access**: Trainer-facing (tabs visible, no authentication yet)
- **Purpose**: Read-only transcript view for reviewing completed or in-progress sessions

### 2. Review API Endpoint
- **Route**: `/api/review/[token]`
- **Method**: GET
- **Input**: Invite token (not score token)
- **Response**: Session data with redacted attendeeProfile
- **Security**: Never exposes attendeeProfile to client

### 3. Review Links Added
- **Scenario Tracker** (`/admin`): "Review" button for each invite
- **Scorecard Page** (`/share/[token]`): "Review Session" button (when invite token available)

## Routes Added

### `/review/[token]` (Page)
Client component that displays:
- Session metadata (conference, persona, trainee, difficulty, start time, status)
- Full conversation transcript with color-coded message bubbles:
  - **You** (trainee): Indigo bubble
  - **Attendee** (persona): Purple bubble
  - **System** (feedback): Gray bubble
- Timestamps for each message
- Guardrail violations (if any)
- Session ID footer

### `/api/review/[token]` (API)
Server endpoint that:
1. Resolves invite token to sessionId using `getInvite()`
2. Validates invite is not revoked
3. Fetches session from storage
4. Redacts `attendeeProfile` from kickoff
5. Normalizes transcript using `normalizeTranscript()`
6. Returns safe session data

## Data Redaction

### What is Exposed
✅ Conference name, ID, context
✅ Persona ID, display name
✅ Trainee ID, short name
✅ Difficulty level
✅ Start time, active status
✅ Current state, state history
✅ Full transcript (trainee, attendee, system messages)
✅ Violations array
✅ Enrichment data (if present)

### What is Redacted
❌ `attendeeProfile` (hidden persona profile used for AI generation)
- Never sent to client
- Omitted from kickoff object in API response
- Ensures trainee cannot reverse-engineer persona details

## Manual Test Steps

### Prerequisites
1. Have dev server running: `npm run dev`
2. Have at least one completed session with a few messages
3. Have the invite token for the session

### Test Plan

#### 1. Create Test Session
1. Navigate to Scenario Builder (`/`)
2. Select a conference, persona, trainee, difficulty
3. Click "Create Invite" and copy the trainee URL
4. Open trainee URL in new tab (`/s/{token}`)
5. Send 3-5 messages in the conversation
6. Optionally end the session (or leave in progress)
7. Note the invite token from the URL

#### 2. Access Review from Scenario Tracker
1. Navigate to Scenario Tracker (`/admin`)
2. Find your test session in the table
3. **Verify**: "Review" button appears in Actions column (cyan color)
4. Click "Review" button
5. **Verify**: Redirects to `/review/{token}`
6. **Verify**: Page shows session metadata correctly
7. **Verify**: Transcript shows all messages with correct labels and timestamps
8. **Verify**: Status badge shows correct state (In Progress or Completed)

#### 3. Access Review from Scorecard
1. Complete a session if not already done
2. Navigate to scorecard page (`/share/{scoreToken}`)
3. **Verify**: "Review Session" button appears (cobalt/blue color)
4. Click "Review Session"
5. **Verify**: Redirects to `/review/{inviteToken}`
6. **Verify**: Same session data displayed correctly

#### 4. Session Metadata Display
1. On review page, check Session Details card
2. **Verify**: Conference name displays (or fallback to ID)
3. **Verify**: Persona display name shows (or fallback to ID)
4. **Verify**: Trainee short name displays (or fallback to ID)
5. **Verify**: Difficulty shows correctly (easy/medium/hard)
6. **Verify**: Start time formatted as "Mon DD, HH:MM:SS AM/PM"
7. **Verify**: Status badge color matches state:
   - Blue badge for "In Progress"
   - Green badge for "Completed"

#### 5. Transcript Display
1. **Verify**: Conversation Transcript section shows all messages
2. **Verify**: Message bubbles color-coded:
   - Indigo for "You" (trainee)
   - Purple for "Attendee" (persona)
   - Gray for "System" (feedback)
3. **Verify**: Each message has timestamp
4. **Verify**: Text preserved with whitespace (whitespace-pre-wrap)
5. **Verify**: Messages in chronological order

#### 6. Empty States
1. Test with session that has no messages yet
2. **Verify**: Shows "No messages yet" message
3. Test with invalid token: `/review/invalid-token-12345`
4. **Verify**: Shows "Session Not Found" error page
5. **Verify**: "Back to Tracker" button works

#### 7. Guardrail Violations
1. Test with session that has violations
2. **Verify**: Violations section appears with red styling
3. **Verify**: All violations listed with bullet points
4. Test with session that has no violations
5. **Verify**: Violations section does not appear

#### 8. Privacy Verification (Critical)
1. Open browser DevTools
2. Navigate to review page
3. Go to Network tab, find `/api/review/{token}` request
4. Examine response JSON
5. **Verify**: NO `attendeeProfile` field present anywhere
6. **Verify**: Kickoff object contains only safe fields:
   - conferenceContext ✅
   - difficulty ✅
   - personaId ✅
   - enrichment ✅
   - conferenceId, conferenceName ✅
   - personaDisplayName ✅
   - traineeId, traineeNameShort ✅
   - attendeeProfile ❌ (must be absent)

#### 9. Navigation Testing
1. On review page, click "Back to Tracker"
2. **Verify**: Returns to `/admin`
3. **Verify**: Navigation tabs remain visible throughout

#### 10. Long Transcript Testing
1. Create session with 10+ messages
2. Navigate to review page
3. **Verify**: All messages display without truncation
4. **Verify**: Page scrolls normally
5. **Verify**: Performance is acceptable

#### 11. Special Characters Testing
1. Send messages with:
   - Emojis: "Great! 🎉"
   - Line breaks: "Line 1\nLine 2"
   - Long text: 500+ characters
2. **Verify**: All text renders correctly
3. **Verify**: No layout breaks

#### 12. Timestamp Accuracy
1. Note the time you send a message
2. Check review page timestamp
3. **Verify**: Timestamp matches within a few seconds
4. **Verify**: Timezone displays correctly for your locale

#### 13. Concurrent Sessions
1. Create 2 invites for different scenarios
2. Start both sessions, send different messages
3. Review each session separately
4. **Verify**: Transcripts don't mix between sessions
5. **Verify**: Metadata is correct for each

#### 14. Build Verification
1. Run `npm run build`
2. **Verify**: Build completes successfully
3. **Verify**: Route listed: `ƒ /review/[token]`
4. **Verify**: API route listed: `ƒ /api/review/[token]`
5. Start production build: `npm run start`
6. Test review functionality in production mode

## Files Modified

### New Files
- `app/api/review/[token]/route.ts` - Review API endpoint
- `app/review/[token]/page.tsx` - Review page component

### Modified Files
- `app/admin/page.tsx` - Added Review button to Scenario Tracker
- `app/share/[token]/page.tsx` - Added Review Session button to Scorecard
- `app/api/share/[token]/route.ts` - Added inviteToken to response

## Technical Details

### Token Resolution Flow
1. User visits `/review/{inviteToken}`
2. Page calls `/api/review/{inviteToken}`
3. API calls `getInvite(inviteToken)` to get invite record
4. Invite record contains `sessionId`
5. API calls `getSession(sessionId)` to get full session
6. API redacts `attendeeProfile` from kickoff
7. API returns safe session data

### Scorecard Review Link Flow
1. User visits `/share/{scoreToken}`
2. Page calls `/api/share/{scoreToken}`
3. API calls `getScore(scoreToken)` to get score record
4. Score record contains `sessionId`
5. API calls `getInviteForSession(sessionId)` to reverse-lookup invite token
6. API returns score data + `inviteToken`
7. Page renders "Review Session" button linking to `/review/{inviteToken}`

### Transcript Normalization
Uses `normalizeTranscript()` from `lib/normalizeTranscript.ts`:
- Filters out null/undefined messages
- Validates message structure (id, type, text, timestamp)
- Ensures type is system|trainee|attendee
- Returns only valid messages

### Message Types
- **system**: Automated messages (icebreaker, feedback, transitions)
- **trainee**: User's messages
- **attendee**: AI-generated persona responses

## Security Considerations

### Privacy Protection
- `attendeeProfile` NEVER exposed to client
- Ensures trainees can't reverse-engineer hidden persona details
- Maintains integrity of simulation difficulty levels

### Access Control (Future)
- Currently no authentication required
- Phase J2 could add:
  - Trainer authentication
  - Session ownership validation
  - Audit logging for review access

### Data Exposure
- Only snapshot data from invite/session displayed
- No PII beyond what's already in trainee record
- Transcript is full history but intentionally exposed for review

## Known Limitations

1. **No Authentication**: Anyone with invite token can view review (auth planned for future)
2. **No Pagination**: Long transcripts load all at once (acceptable for v1)
3. **No Export**: Can't download transcript as PDF/CSV (future enhancement)
4. **No Filtering**: Can't filter transcript by message type (future enhancement)
5. **No Search**: Can't search within transcript (future enhancement)
6. **Invite Token Required**: Review requires invite token, not score token directly

## Future Enhancements (Not in Phase J1)

- Trainer authentication and authorization
- Transcript export (PDF, CSV, JSON)
- Message filtering (show only trainee, only attendee, etc.)
- Search within transcript
- Highlight keywords or violations in transcript
- Side-by-side comparison of multiple sessions
- Annotate transcript with trainer notes
- Direct link from review to scorecard
- Real-time session monitoring (live transcript view)

## Success Criteria

✅ Review page accessible via `/review/{token}`
✅ API endpoint redacts attendeeProfile
✅ Review button appears in Scenario Tracker
✅ Review Session button appears in Scorecard (when token available)
✅ Full transcript displays with correct labels
✅ Timestamps formatted correctly
✅ Session metadata displays accurately
✅ Empty states handle gracefully
✅ Violations display when present
✅ Build completes without errors
✅ No privacy leaks (attendeeProfile never exposed)

## Rollback Plan

If issues arise, remove review functionality by:
1. Delete `app/review` directory
2. Delete `app/api/review` directory
3. Revert changes to `app/admin/page.tsx` (remove Review button)
4. Revert changes to `app/share/[token]/page.tsx` (remove Review Session button)
5. Revert changes to `app/api/share/[token]/route.ts` (remove inviteToken)

All existing functionality remains unchanged. Review is additive only.
