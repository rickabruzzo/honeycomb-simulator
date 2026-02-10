# Testing Guide: Quick Verification Steps

## Start Dev Server

```bash
npm run dev
```

Then open: http://localhost:3000

---

## Test 1: SELF_SERVICE_READY Auto-End

**Goal:** Verify that self-service conversations auto-end with correct outcome.

1. Go to Scenario Builder (/)
2. Click "Generate Random Invite"
3. Click "Start Session" on the invite
4. **Trainee says:** "What do you all do?"
5. **Attendee responds** (wait for response)
6. **Trainee says:** "Interesting. Is there a free tier I can try out?"
7. **Attendee responds** (may mention docs/free tier)
8. **Trainee says:** "That sounds great, I'll check it out"

**Expected Results:**
- ✅ Session auto-ends immediately
- ✅ Attendee says "*walks away from the booth*"
- ✅ System feedback shows:
  - "Outcome: SELF_SERVICE_READY"
  - Success message like "Self-service is a valid success path"
  - Turn count (not wall-clock time)
- ✅ Session marked inactive (no more input field)
- ✅ Redirected to share page after 2 seconds

**Check Grading:**
- Go to Review page (if accessible) or Share page
- **Expected:** Grade B or C (NEVER F)
- **Expected:** Highlights include "self-service path (SUCCESS)"

---

## Test 2: MQL_READY Auto-End

**Goal:** Verify badge scan/follow-up conversations end correctly.

1. Start a new session
2. **Trainee says:** "Tell me about your observability platform"
3. **Attendee responds**
4. **Trainee says:** "I'd like to learn more about pricing. Can you scan my badge?"
5. **Attendee responds** (likely positive)
6. **Trainee says:** "Perfect, let's follow up"

**Expected Results:**
- ✅ Session auto-ends
- ✅ Attendee exit message appears
- ✅ Feedback shows "Outcome: MQL_READY"
- ✅ Success message like "MQL/follow-up is a high-value outcome"
- ✅ Grade B or A (NEVER F)
- ✅ Highlights mention "MQL opportunity (SUCCESS)"

---

## Test 3: DEMO_READY Auto-End

**Goal:** Verify demo interest triggers auto-end.

1. Start a new session
2. **Trainee says:** "What problems does Honeycomb solve?"
3. **Attendee responds**
4. **Trainee says:** "I'd love to see a quick demo"
5. **Attendee responds** (likely accepts)
6. **Trainee says:** "Sounds good"

**Expected Results:**
- ✅ Session auto-ends
- ✅ Outcome: DEMO_READY
- ✅ Success feedback
- ✅ Grade B or A

---

## Test 4: Dynamic Opening Lines

**Goal:** Verify opening varies by persona.

**Test Frustrated SRE:**
1. Go to Scenario Builder
2. Create invite with:
   - Persona: SRE with "Alert fatigue" or "Recent outage"
3. Start session
4. **Expected:** Opening like:
   - "*approaches looking visibly frustrated*"
   - "*looks tense—like they've been firefighting*"

**Test Curious Engineer:**
1. Create invite with persona showing "curious" or "engaged" emotional posture
2. **Expected:** "*leans in, scanning the booth display*"

**Test Rushed Executive:**
1. Create invite with executive persona or "time-constrained" modifier
2. **Expected:** "*approaches quickly, checking phone*"

**Test Burned Out:**
1. Create invite with "burned out" or "exhausted" emotional posture
2. **Expected:** "*sighs, half-smiles, looks tired*"

---

## Test 5: Practice Session Header

**Goal:** Verify header formatting.

1. Start any session
2. Check header displays:
   ```
   Conference: AWS re:Invent
   Themes: Cloud migration, Microservices
   Seniority mix: Mixed (IC to VP)
   Observability maturity: Intermediate
   ```
3. **Expected:**
   - ✅ Each field on separate line
   - ✅ Values are bold (not labels)
   - ✅ "State: ICEBREAKER" visible
   - ✅ No awkward wrapping
   - ✅ Header stays sticky when scrolling

---

## Test 6: Scenario Tracker Loading

**Goal:** Verify admin page loads invites.

1. Go to `/admin` (Scenario Tracker)
2. **Expected:**
   - ✅ Page loads within 2-3 seconds
   - ✅ Shows list of invites (if any exist)
   - ✅ NOT stuck on "Loading invites..." forever

**If error occurs:**
3. **Expected:**
   - ✅ Shows error message
   - ✅ "Retry" button visible
4. Click Retry
5. **Expected:** Reloads data

**If no invites:**
- **Expected:** "No invites yet. Create one from the Scenario Builder."

---

## Test 7: No Manual End Needed

**Goal:** Verify trainees don't need to click "End Session" for wins.

1. Complete a SELF_SERVICE_READY conversation (as in Test 1)
2. **Expected:** Session ends automatically
3. **Expected:** No need to click "End Session" button
4. **Expected:** Feedback appears immediately
5. **Expected:** Redirect to share page happens automatically

---

## Test 8: Grading Never F for Success

**Goal:** Verify success outcomes protected from F grade.

**Test with violations:**
1. Start session
2. **Trainee says:** "Honeycomb has high-cardinality wide events" (uses banned keywords)
3. Continue to self-service close: "Is there a free tier?"
4. **Trainee says:** "That sounds great"
5. Session auto-ends
6. **Expected:**
   - ✅ Grade is C or D (NOT F, despite violations)
   - ✅ Violations listed in mistakes
   - ✅ But outcome marked as success

---

## Test 9: Turn Efficiency (Not Wall-Clock)

**Goal:** Verify grading uses turn count, not time.

**Test with pauses:**
1. Start session
2. Send 1 message
3. **Wait 5 minutes** (go get coffee)
4. Send 2 more messages
5. Complete self-service close within turn limit (easy: 10, medium: 12, hard: 14)
6. **Expected:**
   - ✅ Feedback shows turn count (e.g., "Turns: 6")
   - ✅ NOT penalized for 5-minute pause
   - ✅ Highlights mention "Efficient convergence" if within limits

---

## Test 10: Exit on State Progression

**Goal:** Verify auto-end works in SOLUTION_FRAMING too.

1. Start session
2. Progress through states normally (ICEBREAKER → EXPLORATION → PAIN_DISCOVERY → SOLUTION_FRAMING)
3. In SOLUTION_FRAMING: "Can you scan my badge for follow-up?"
4. Trainee: "Perfect"
5. **Expected:**
   - ✅ Auto-ends even though not in OUTCOME state yet
   - ✅ MQL_READY outcome

---

## Common Issues & Fixes

### Issue: Session doesn't auto-end

**Check:**
- Is outcome detection working? (Check browser console for errors)
- Did attendee use acceptance phrase? Try: "sounds good", "perfect", "that works"
- Is state OUTCOME or SOLUTION_FRAMING?

**Fix:**
- Refresh page
- Try more explicit acceptance: "That sounds great, let's do it"

### Issue: Scenario Tracker stuck loading

**Check:**
- Browser console for network errors
- `/api/admin/invites` endpoint (open in new tab)

**Fix:**
- Hard refresh (Cmd+Shift+R or Ctrl+Shift+R)
- Click Retry button if shown
- Check server logs in terminal

### Issue: Opening line doesn't vary

**Check:**
- Did you create a new session? (Old sessions use old opening)
- Check persona profile includes emotional posture

**Fix:**
- Create new invite with different persona
- Verify persona has emotional posture field set

---

## Quick Smoke Test (5 minutes)

```bash
# 1. Build check
npm run build

# 2. Start dev
npm run dev

# 3. Test auto-end
# - Go to /
# - Generate random invite
# - Start session
# - Say: "Is there a free tier?"
# - Say: "Sounds good"
# - Verify auto-end

# 4. Check admin
# - Go to /admin
# - Verify invites load

# 5. Done!
```

---

## Verification Checklist

Copy this to verify all features:

```
[ ] SELF_SERVICE_READY auto-ends correctly
[ ] MQL_READY auto-ends correctly
[ ] DEMO_READY auto-ends correctly
[ ] Exit message appears ("*walks away*")
[ ] Feedback shows turn count (not wall-clock)
[ ] Success outcomes never get F grade
[ ] Dynamic opening varies by emotional posture
[ ] Header shows conference details on separate lines
[ ] Values bolded in header
[ ] State remains visible in header
[ ] Scenario Tracker loads invites
[ ] Error state shows retry option
[ ] No manual "End Session" needed for wins
[ ] Grading uses turn efficiency
[ ] Pauses don't penalize grade
```

---

## Troubleshooting

**Build fails:**
```bash
npm run build
# Check error messages
# Likely TypeScript error - fix and rebuild
```

**Dev server won't start:**
```bash
# Kill existing process
killall node
# Restart
npm run dev
```

**API returns 500:**
- Check terminal logs
- Check `/tmp/` or memory store state
- Try cleanup: `curl -X POST http://localhost:3000/api/admin/cleanup`

**State not advancing:**
- Check violations in UI
- Try open-ended questions: "What", "How", "Tell me about"
- Show empathy: "That sounds frustrating"

---

## Next Steps After Testing

If all tests pass:
1. ✅ Implementation verified
2. ✅ Ready for production use
3. ✅ Document any edge cases found
4. ✅ Share testing results with team

If issues found:
1. Note specific test that failed
2. Check browser console for errors
3. Check server terminal for logs
4. File issue with reproduction steps
