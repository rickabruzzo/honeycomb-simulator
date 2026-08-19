/**
 * Small-talk detection, director, and generator tests.
 *
 * Ensures:
 * - isSmallTalkQuestion correctly detects conference/day questions
 * - decideNextMove returns move="answer" + smallTalk=true in HOOK/RAPPORT
 * - generateAttendeeReply produces casual answers (no "helpful context" / no trailing '?')
 *
 * Run with:  npx tsx lib/__tests__/smallTalk.test.ts
 */

import { isSmallTalkQuestion, decideNextMove } from "../attendee/conversationDirector";
import { generateAttendeeReply } from "../attendee/generateAttendeeReply";
import type { SessionState } from "../storage";

let passed = 0;
let failed = 0;

function assert(label: string, actual: unknown, expected: unknown) {
  if (actual === expected) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`      expected: ${JSON.stringify(expected)}`);
    console.error(`      received: ${JSON.stringify(actual)}`);
    failed++;
  }
}

function assertNotNull(label: string, actual: unknown) {
  if (actual != null) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`      expected non-null, got: ${String(actual)}`);
    failed++;
  }
}

function assertDoesNotContain(label: string, text: string, substring: string) {
  if (!text.toLowerCase().includes(substring.toLowerCase())) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`      text should NOT contain "${substring}"`);
    console.error(`      received: "${text}"`);
    failed++;
  }
}

function assertDoesNotEndWith(label: string, text: string, char: string) {
  if (!text.trimEnd().endsWith(char)) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`      text should NOT end with "${char}"`);
    console.error(`      received: "${text}"`);
    failed++;
  }
}

// ── Helper: build a minimal session ─────────────────────────────────────────

function makeSession(
  transcript: Array<{ type: "system" | "trainee" | "attendee"; text: string }>
): SessionState {
  return {
    id: "test-session",
    currentState: "CONVERSATION",
    stateHistory: [],
    transcript: transcript.map((m, i) => ({
      id: `msg-${i}`,
      type: m.type,
      text: m.text,
      timestamp: new Date().toISOString(),
    })),
    violations: [],
    kickoff: {
      attendeeProfile: "Persona: SRE\nModifiers: time-constrained\nEmotional posture: guarded",
    },
    startTime: new Date().toISOString(),
    active: true,
  } as SessionState;
}

// ── isSmallTalkQuestion ─────────────────────────────────────────────────────

console.log("\n📋 isSmallTalkQuestion");

assert(
  "detects 'How's your day going?'",
  isSmallTalkQuestion("How's your day going?"),
  true
);

assert(
  "detects 'How's the conference?'",
  isSmallTalkQuestion("How's the conference?"),
  true
);

assert(
  "detects 'How's it going?'",
  isSmallTalkQuestion("How's it going?"),
  true
);

assert(
  "detects 'How's things going?'",
  isSmallTalkQuestion("How's things going?"),
  true
);

assert(
  "detects 'conference treating you' variant",
  isSmallTalkQuestion("How's the conference treating you?"),
  true
);

assert(
  "detects 'conference so far' variant",
  isSmallTalkQuestion("How's the conference so far?"),
  true
);

assert(
  "detects 'seen anything today that stood out?'",
  isSmallTalkQuestion("Have you seen anything today that stood out?"),
  true
);

assert(
  "rejects without question mark",
  isSmallTalkQuestion("How's your day going"),
  false
);

assert(
  "rejects technical question",
  isSmallTalkQuestion("What monitoring tools do you use?"),
  false
);

assert(
  "rejects empty string",
  isSmallTalkQuestion(""),
  false
);

// ── decideNextMove: small-talk in HOOK/RAPPORT ──────────────────────────────

console.log("\n📋 decideNextMove — small-talk detection");

{
  // HOOK stage: attendee just opened non-verbally, trainee responds with small talk
  const session = makeSession([
    { type: "system", text: "*approaches looking visibly frustrated*" },
    { type: "attendee", text: "Hey, how's your day going?" },
  ]);

  const directive = decideNextMove(session, undefined, "Pretty good! How's the conference treating you?");
  assert("RAPPORT + small-talk → move is 'answer'", directive.move, "answer");
  assert("RAPPORT + small-talk → smallTalk is true", directive.smallTalk, true);
  assert(
    "RAPPORT + small-talk → does NOT produce ask_hook or share_pain",
    directive.move !== "ask_hook" && directive.move !== "share_pain",
    true
  );
}

{
  // RAPPORT stage: trainee asks "How's the conference?"
  const session = makeSession([
    { type: "system", text: "*walks up, glances at badge, keeps it brief*" },
    { type: "attendee", text: "Hey there." },
  ]);

  const directive = decideNextMove(session, undefined, "Hey! How's the conference so far?");
  assert("RAPPORT + conference question → move is 'answer'", directive.move, "answer");
  assert("RAPPORT + conference question → smallTalk is true", directive.smallTalk, true);
}

// ── generateAttendeeReply: small-talk output ────────────────────────────────

console.log("\n📋 generateAttendeeReply — small-talk output");

{
  const session = makeSession([
    { type: "system", text: "*walks up, glances at badge, keeps it brief*" },
    { type: "attendee", text: "Hey there." },
  ]);

  const result = generateAttendeeReply({
    traineeText: "Hey! How's the conference so far?",
    session,
    traineeTurnCount: 1,
  });

  assertNotNull("small-talk produces a reply", result);
  if (result) {
    assertDoesNotContain(
      "output does not contain 'helpful context'",
      result.text,
      "helpful context"
    );
    assertDoesNotContain(
      "output does not contain 'Got it — on'",
      result.text,
      "Got it — on"
    );
    assertDoesNotContain(
      "output does not contain 'Got it — and on'",
      result.text,
      "Got it — and on"
    );
    assertDoesNotEndWith(
      "output does not end with '?'",
      result.text,
      "?"
    );
    assert(
      "source is 'template'",
      result.source,
      "template"
    );
  }
}

{
  // Multiple small-talk questions should produce different answers (deterministic by turn)
  const answers = new Set<string>();
  for (let i = 0; i < 5; i++) {
    const session = makeSession([
      { type: "system", text: "*approaches booth*" },
      // Pad with varying message counts to get different indices
      ...Array.from({ length: i }, (_, j) => ({
        type: "attendee" as const,
        text: `filler message ${j}`,
      })),
      ...Array.from({ length: i }, (_, j) => ({
        type: "trainee" as const,
        text: `filler trainee ${j}`,
      })),
      { type: "attendee", text: "Hey." },
    ]);

    const result = generateAttendeeReply({
      traineeText: "How's your day going?",
      session,
      traineeTurnCount: i + 1,
    });
    if (result) answers.add(result.text);
  }
  assert(
    "small-talk produces varied answers across turns",
    answers.size > 1,
    true
  );
}

// ── enforceContinuity: small-talk skips callback ────────────────────────────

console.log("\n📋 enforceContinuity — small-talk bypass");

{
  // When smallTalk=true, enforceContinuity should NOT prepend contextual callback
  const session = makeSession([
    { type: "system", text: "*approaches booth*" },
    { type: "attendee", text: "Hey, how's it going?" },
  ]);

  const result = generateAttendeeReply({
    traineeText: "How's the conference treating you?",
    session,
    traineeTurnCount: 1,
  });

  assertNotNull("produces a reply", result);
  if (result) {
    assertDoesNotContain(
      "no contextual callback prefix in small-talk",
      result.text,
      "That's helpful context"
    );
    assertDoesNotContain(
      "no 'on the X side' prefix in small-talk",
      result.text,
      "on the"
    );
  }
}

// ── Report ──────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
