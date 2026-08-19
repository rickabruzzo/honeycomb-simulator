# Attendee Realism Engine — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the machinery that is fighting the design — the keyword template layer, the
2-sentence reply cap, and three contradictory sources of behavioral instruction — and route
attendee generation to a frontier model, so the attendee answers what the trainee actually
asked and can deliver a war story when listening earns one.

**Architecture:** The LLM serves every turn. Reply length becomes a phase-derived budget
instead of a hard truncation. `lib/simulator.config.json` becomes the single source of
behavioral truth; the prose bundle shrinks to voice and character; `promptComposer`'s runtime
injections stop contradicting both. Generation moves to the AI SDK through Vercel AI Gateway.

**Tech Stack:** Next.js 16, TypeScript, `ai@^6` (AI SDK) via Vercel AI Gateway, Vitest,
OpenTelemetry → Honeycomb, Vercel KV.

**Spec:** `docs/superpowers/specs/2026-08-19-attendee-realism-engine-design.md`

**Not in this plan:** the judge/reducer/revealBudget pipeline, OTel turn attributes, and admin
debug mode are Phase 2 (outlined at the end, planned in detail after the Phase 1 gate).
Scoring, scenario content, and the Claude Design UX pass are separate efforts.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `vitest.config.ts` | Test runner config | Create |
| `lib/attendee/postProcess.ts` | Sanitize model output; runaway guard only | Modify (remove truncator) |
| `lib/attendee/postProcess.test.ts` | Prove the cap is gone and sanitizers remain | Create |
| `lib/attendee/lengthBudget.ts` | Phase → sentence budget + prompt directive | Create |
| `lib/attendee/lengthBudget.test.ts` | Budget per phase | Create |
| `lib/llm/gateway.ts` | `GatewayChatProvider` via AI SDK | Create |
| `lib/llm/chatTypes.ts` | Add `"gateway"` to provider union | Modify |
| `lib/llm/chatProvider.ts` | Provider selection + shared mock fallback | Modify |
| `lib/llm/defaultPromptBundle.ts` | Thin voice/character bundle (v2.0.0) | Rewrite prompt text |
| `lib/llm/promptComposer.ts` | Stop injecting converge-now directives; add length directive | Modify |
| `app/api/session/[id]/message/route.ts` | LLM serves every turn | Modify (remove template branch) |
| `lib/storage.ts` | Drop template-only session fields | Modify |
| `lib/attendee/{templates,intentClassifier,intentTypes,variantPicker,generateAttendeeReply}.ts` | — | Delete |
| `scripts/smoke-gateway.mjs` | One-shot gateway connectivity check | Create |

Ordering rationale: test infrastructure first, then the two pure units (testable with no API
key), then the gateway, then the template deletion (so the first LLM-only session already runs
on the good model), then the prompt work, then cleanup.

---

## Task 1: Test infrastructure

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Create the config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

- [ ] **Step 3: Add test scripts**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Then update the existing `validate` script to include tests:

```json
"validate": "npm run lint:json && npm run test:detection && npm run test && npm run build"
```

- [ ] **Step 4: Verify the runner starts**

Run: `npm test`
Expected: exits successfully reporting "No test files found" (no tests exist yet). If it
errors on config resolution, fix before continuing.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "test: add vitest runner for lib unit tests"
```

---

## Task 2: Remove the reply-length cap from postProcess

The cap is why venting and war stories can never be delivered (spec §2.4). Sanitizers stay;
the style truncator goes; a generous runaway ceiling replaces it.

**Files:**
- Create: `lib/attendee/postProcess.test.ts`
- Modify: `lib/attendee/postProcess.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/attendee/postProcess.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { postProcessAttendeeText } from "./postProcess";

const WAR_STORY = [
  "We had an outage back in March.",
  "Checkout was failing for about twenty minutes before anyone noticed.",
  "Support saw it before we did, which was humbling.",
  "We spent the first half hour arguing about which service to even look at.",
  "Turned out to be a connection pool nobody had ever instrumented.",
  "I still think about that one.",
].join(" ");

describe("postProcessAttendeeText", () => {
  it("preserves a six-sentence war story in full", () => {
    expect(postProcessAttendeeText(WAR_STORY)).toBe(WAR_STORY);
  });

  it("preserves a four-sentence vent in full", () => {
    const vent =
      "Our bill went up again this quarter. " +
      "Nobody can tell me which team caused it. " +
      "So now we are arguing about tags instead of fixing anything. " +
      "It is exhausting.";
    expect(postProcessAttendeeText(vent)).toBe(vent);
  });

  it("strips markdown emphasis", () => {
    expect(postProcessAttendeeText("That is **really** annoying.")).toBe(
      "That is really annoying."
    );
  });

  it("strips leading bullets and numbering", () => {
    expect(postProcessAttendeeText("- Datadog for metrics.")).toBe("Datadog for metrics.");
    expect(postProcessAttendeeText("1. Datadog for metrics.")).toBe("Datadog for metrics.");
  });

  it("strips parenthetical stage directions", () => {
    expect(postProcessAttendeeText("(rolls eyes) It is fine.")).toBe("It is fine.");
  });

  it("strips state-leakage narration in parentheses", () => {
    expect(
      postProcessAttendeeText("(Moves firmly into PAIN DISCOVERY) Alerts are the worst part.")
    ).toBe("Alerts are the worst part.");
  });

  it("strips a trailing question lobbed back at the trainee", () => {
    expect(postProcessAttendeeText("We use Grafana. What about you?")).toBe("We use Grafana.");
  });

  it("truncates only beyond the runaway ceiling, at a sentence boundary", () => {
    const runaway = "This is a sentence about alert noise. ".repeat(60);
    const out = postProcessAttendeeText(runaway);
    expect(out.length).toBeLessThanOrEqual(1200);
    expect(out.endsWith(".")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- postProcess`
Expected: the two "preserves" tests FAIL — the current implementation truncates to 2
sentences. Sanitizer tests should already pass.

- [ ] **Step 3: Replace the implementation**

Replace the entire contents of `lib/attendee/postProcess.ts`:

```ts
/**
 * Sanitizer for attendee model output.
 *
 * Enforces the medium (spoken dialogue, not written prose) and guards against runaway
 * output. It deliberately does NOT enforce reply length as a style rule — length is a
 * budget instructed in the prompt (see lengthBudget.ts), because a hard cap makes the
 * venting and war-story reward mechanic impossible to deliver.
 */

/** Absolute ceiling. A runaway guard, not a style rule. */
const RUNAWAY_CEILING = 1200;

export function postProcessAttendeeText(text: string): string {
  let processed = text;

  // Spoken dialogue has no lists or markdown.
  processed = processed.replace(/^[\s]*[-•*]\s*/gm, "");
  processed = processed.replace(/^[\s]*\d+\.\s*/gm, "");
  processed = processed.replace(/[*_`]/g, "");

  // Parentheticals are stripped deliberately: stage directions read as narration, and
  // hidden-state commentary like "(Moves into PAIN DISCOVERY)" must never reach a trainee.
  processed = processed.replace(/\([^)]*\)/g, "");

  // The attendee does not interview the trainee back.
  processed = processed.replace(/what about you\??/gi, "");
  processed = processed.replace(/how about you\??/gi, "");
  processed = processed.replace(/what about your\s+\w+\??/gi, "");
  processed = processed.replace(/how about your\s+\w+\??/gi, "");

  processed = processed.replace(/\s+/g, " ").trim();

  if (processed.length > RUNAWAY_CEILING) {
    const truncated = processed.substring(0, RUNAWAY_CEILING);
    const lastTerminator = Math.max(
      truncated.lastIndexOf("."),
      truncated.lastIndexOf("!"),
      truncated.lastIndexOf("?")
    );
    processed =
      lastTerminator > 0
        ? truncated.substring(0, lastTerminator + 1).trim()
        : truncated.trim() + "...";
  }

  return processed;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- postProcess`
Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/attendee/postProcess.ts lib/attendee/postProcess.test.ts
git commit -m "fix: stop truncating attendee replies to two sentences

The cap was applied to LLM output as well as templates, making empathy-triggered
venting and war stories - the designated reward for good listening - impossible to
deliver. Sanitizers and a runaway ceiling remain; length is now instructed, not clipped."
```

---

## Task 3: Phase-derived length budget

Replaces the hard cap with an instruction. Phase 1 keys off conversation phase only; Phase 2
makes it trust-aware.

**Files:**
- Create: `lib/attendee/lengthBudget.ts`
- Create: `lib/attendee/lengthBudget.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/attendee/lengthBudget.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getLengthBudget, renderLengthDirective } from "./lengthBudget";

describe("getLengthBudget", () => {
  it("keeps the icebreaker short", () => {
    expect(getLengthBudget("ICEBREAKER")).toEqual({ minSentences: 1, maxSentences: 2 });
  });

  it("allows room to vent in pain discovery", () => {
    expect(getLengthBudget("PAIN_DISCOVERY")).toEqual({ minSentences: 2, maxSentences: 6 });
  });

  it("allows a considered reply in solution framing", () => {
    expect(getLengthBudget("SOLUTION_FRAMING")).toEqual({ minSentences: 2, maxSentences: 4 });
  });

  it("falls back to a middle budget for an unknown phase", () => {
    expect(getLengthBudget("NOT_A_PHASE")).toEqual({ minSentences: 2, maxSentences: 3 });
  });
});

describe("renderLengthDirective", () => {
  it("renders a range as a natural instruction", () => {
    expect(renderLengthDirective({ minSentences: 2, maxSentences: 6 })).toBe(
      "LENGTH: Roughly 2 to 6 sentences. Say as much as this moment actually warrants - no padding, and do not cut a story short if you have decided to tell it."
    );
  });

  it("renders a single-sentence budget without a range", () => {
    expect(renderLengthDirective({ minSentences: 1, maxSentences: 1 })).toBe(
      "LENGTH: One sentence. You are not in the mood to say more right now."
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- lengthBudget`
Expected: FAIL — "Failed to resolve import ./lengthBudget".

- [ ] **Step 3: Write the implementation**

Create `lib/attendee/lengthBudget.ts`:

```ts
/**
 * Reply length as an instructed budget rather than a truncation.
 *
 * Phase 1 derives the budget from conversation phase only. Phase 2 will derive it from
 * trust/guard so that a listened-to attendee visibly opens up and an interrupted one
 * visibly closes down.
 */

export interface LengthBudget {
  minSentences: number;
  maxSentences: number;
}

const BUDGETS: Record<string, LengthBudget> = {
  ICEBREAKER: { minSentences: 1, maxSentences: 2 },
  EXPLORATION: { minSentences: 2, maxSentences: 3 },
  PAIN_DISCOVERY: { minSentences: 2, maxSentences: 6 },
  SOLUTION_FRAMING: { minSentences: 2, maxSentences: 4 },
  OUTCOME: { minSentences: 1, maxSentences: 3 },
};

const FALLBACK: LengthBudget = { minSentences: 2, maxSentences: 3 };

export function getLengthBudget(phase: string): LengthBudget {
  return BUDGETS[phase] ?? FALLBACK;
}

export function renderLengthDirective(budget: LengthBudget): string {
  if (budget.minSentences === budget.maxSentences && budget.maxSentences === 1) {
    return "LENGTH: One sentence. You are not in the mood to say more right now.";
  }

  return (
    `LENGTH: Roughly ${budget.minSentences} to ${budget.maxSentences} sentences. ` +
    "Say as much as this moment actually warrants - no padding, and do not cut a story " +
    "short if you have decided to tell it."
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- lengthBudget`
Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/attendee/lengthBudget.ts lib/attendee/lengthBudget.test.ts
git commit -m "feat: derive attendee reply length from conversation phase"
```

---

## Task 4: Resolve AI Gateway model slugs

Gateway slugs version with dots (`anthropic/claude-sonnet-4.6`, not `-4-6`) and the catalog
changes often. Resolve them from the live catalog rather than hardcoding from memory.

**Files:**
- Create: `scripts/smoke-gateway.mjs`
- Modify: `.env.example`

- [ ] **Step 1: Install the AI SDK**

```bash
npm install ai@^6
```

- [ ] **Step 2: Confirm the project is linked and the Gateway is authorized**

```bash
vercel link
```

Then enable AI Gateway in the Vercel dashboard (Project → Settings → AI Gateway), and pull
credentials:

```bash
vercel env pull .env.local --yes
```

This provisions a short-lived `VERCEL_OIDC_TOKEN` (~24h). If that is impractical for local
work, set a static `AI_GATEWAY_API_KEY` in `.env.local` instead — the SDK prefers the API key
when present.

- [ ] **Step 3: Write the smoke script**

Create `scripts/smoke-gateway.mjs`:

```js
// Usage: node --env-file=.env.local scripts/smoke-gateway.mjs
import { gateway, generateText } from "ai";

const models = await gateway.getAvailableModels();
const ids = models.models?.map((m) => m.id) ?? models.map((m) => m.id);

console.log("--- candidate attendee models (frontier) ---");
console.log(ids.filter((id) => /anthropic\/claude-(sonnet|opus)/.test(id)).join("\n"));
console.log("--- candidate judge models (small/fast) ---");
console.log(ids.filter((id) => /haiku|mini|flash/.test(id)).join("\n"));

const model = process.env.ATTENDEE_MODEL ?? ids.find((id) => /anthropic\/claude-sonnet/.test(id));
console.log(`\n--- generating with ${model} ---`);

const res = await generateText({
  model,
  system:
    "You are a tired SRE at a conference booth. Speak in natural, imperfect speech. No lists.",
  messages: [{ role: "user", content: "Hey, what are you working on these days?" }],
  temperature: 0.8,
  maxOutputTokens: 600,
});

console.log(res.text);
console.log("\nusage:", res.usage);
```

- [ ] **Step 4: Run it and record the chosen slugs**

Run: `node --env-file=.env.local scripts/smoke-gateway.mjs`
Expected: a list of available model ids, then a short in-character reply.

If `maxOutputTokens` is rejected as an unknown parameter, check the current AI SDK core
reference at https://ai-sdk.dev/docs/ai-sdk-core and use the current name. Do not guess.

Record the two chosen slugs — they are used in the next task.

- [ ] **Step 5: Document the env contract**

Append to `.env.example`:

```bash
# Attendee generation via Vercel AI Gateway
# Auth: `vercel env pull` provisions VERCEL_OIDC_TOKEN automatically.
# For CI or non-Vercel environments, set AI_GATEWAY_API_KEY instead.
CHAT_PROVIDER="gateway"          # "gateway" | "openai" | unset (mock)
ATTENDEE_MODEL=""                # e.g. anthropic/claude-sonnet-4.6 - verify via scripts/smoke-gateway.mjs
JUDGE_MODEL=""                   # Phase 2. Small/fast model for turn signal classification
ATTENDEE_TEMPERATURE="0.8"       # Higher than the old 0.4: roleplay needs variation
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json scripts/smoke-gateway.mjs .env.example
git commit -m "feat: add AI SDK and gateway model discovery smoke script"
```

---

## Task 5: Gateway chat provider

**Files:**
- Create: `lib/llm/gateway.ts`
- Modify: `lib/llm/chatTypes.ts`
- Modify: `lib/llm/chatProvider.ts`

- [ ] **Step 1: Widen the provider union**

In `lib/llm/chatTypes.ts`, change the `ChatResult.provider` field:

```ts
export interface ChatResult {
  text: string;
  provider: "openai" | "mock" | "gateway";
  model?: string;
  createdAt: string;
}
```

- [ ] **Step 2: Write the gateway provider**

Create `lib/llm/gateway.ts`:

```ts
/**
 * Attendee generation through Vercel AI Gateway.
 *
 * A plain "provider/model" string routes through the Gateway automatically, so swapping
 * models is an env change. Resolve slugs with scripts/smoke-gateway.mjs - they version with
 * dots and the catalog changes.
 */

import { generateText, APICallError } from "ai";
import type { ChatInput, ChatResult } from "./chatTypes";
import type { ChatProvider } from "./chatProvider";

export class GatewayChatProvider implements ChatProvider {
  private model: string;
  private temperature: number;

  constructor(model?: string) {
    const resolved = model || process.env.ATTENDEE_MODEL;
    if (!resolved) {
      throw new Error(
        "ATTENDEE_MODEL is not set. Run scripts/smoke-gateway.mjs to list available slugs."
      );
    }
    this.model = resolved;
    this.temperature = Number(process.env.ATTENDEE_TEMPERATURE ?? 0.8);
  }

  async generate(input: ChatInput): Promise<ChatResult> {
    const messages = input.conversation
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    try {
      const result = await generateText({
        model: this.model,
        system: input.systemPrompt,
        messages,
        temperature: this.temperature,
        maxOutputTokens: 600,
        providerOptions: {
          gateway: { tags: ["feature:attendee-sim"] },
        },
      });

      return {
        text: result.text.trim(),
        provider: "gateway",
        model: this.model,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      if (APICallError.isInstance(error)) {
        console.error("[gateway] generation failed", {
          status: error.statusCode,
          model: this.model,
          sessionId: input.sessionId,
        });
      } else {
        console.error("[gateway] generation failed", {
          error: error instanceof Error ? error.message : "Unknown error",
          model: this.model,
          sessionId: input.sessionId,
        });
      }
      throw error;
    }
  }
}
```

- [ ] **Step 3: Wire provider selection**

In `lib/llm/chatProvider.ts`, replace the entire `getChatProvider` function with the version
below. It extracts the duplicated fallback wrapper and adds the gateway branch, keeping the
OpenAI path available as a rollback.

```ts
/**
 * Wrap a provider so a generation failure degrades to the mock rather than failing a session.
 */
function withMockFallback(primary: ChatProvider, label: string): ChatProvider {
  return {
    async generate(input: ChatInput): Promise<ChatResult> {
      try {
        return await primary.generate(input);
      } catch (error) {
        console.warn(
          `[ChatProvider] ${label} generation failed, falling back to mock:`,
          error instanceof Error ? error.message : "Unknown error"
        );
        return await new MockChatProvider().generate(input);
      }
    },
  };
}

/**
 * Get Chat Provider
 * CHAT_PROVIDER=gateway → Vercel AI Gateway (preferred)
 * CHAT_PROVIDER=openai  → direct OpenAI (legacy rollback path)
 * unset                 → MockChatProvider
 */
export function getChatProvider(): ChatProvider {
  const chatProvider = process.env.CHAT_PROVIDER;

  if (chatProvider === "gateway") {
    try {
      return withMockFallback(new GatewayChatProvider(), "Gateway");
    } catch (error) {
      console.warn(
        "[ChatProvider] Failed to initialize gateway provider, using mock:",
        error instanceof Error ? error.message : "Unknown error"
      );
      return new MockChatProvider();
    }
  }

  if (chatProvider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn(
        "[ChatProvider] CHAT_PROVIDER=openai but OPENAI_API_KEY not set. Falling back to MockChatProvider."
      );
      return new MockChatProvider();
    }
    try {
      return withMockFallback(new OpenAIChatProvider(apiKey), "OpenAI");
    } catch (error) {
      console.warn(
        "[ChatProvider] Failed to initialize OpenAI provider, using mock:",
        error instanceof Error ? error.message : "Unknown error"
      );
      return new MockChatProvider();
    }
  }

  return new MockChatProvider();
}
```

Add the import at the top of `lib/llm/chatProvider.ts`:

```ts
import { GatewayChatProvider } from "./gateway";
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/llm/gateway.ts lib/llm/chatTypes.ts lib/llm/chatProvider.ts
git commit -m "feat: route attendee generation through Vercel AI Gateway

Adds GatewayChatProvider on the AI SDK and makes it the preferred provider.
Raises temperature to 0.8 and output allowance to 600 tokens so venting can
actually be generated. OpenAI path retained as a rollback."
```

---

## Task 6: Make the LLM serve every turn

The template layer intercepts most turns before the model runs (spec §2.1) and force-changes
the subject as topics accumulate (spec §2.2). Remove it from the request path.

**Files:**
- Modify: `app/api/session/[id]/message/route.ts`

- [ ] **Step 1: Remove the template imports**

Delete these two lines near the top of `app/api/session/[id]/message/route.ts`:

```ts
import { generateAttendeeReply } from "@/lib/attendee/generateAttendeeReply";
```

(Keep the `postProcessAttendeeText` import — it is still used.)

- [ ] **Step 2: Replace the generation block**

Find the block beginning `// 5) Generate attendee response (template-based with LLM fallback)`
and ending at the closing brace of the `if (templateResult) { ... } else {` structure
(around lines 244–290). Replace the opening of that block — everything from the comment
through `} else {` and its matching closing brace — so that the LLM path runs unconditionally.

Concretely, replace:

```ts
        // 5) Generate attendee response (template-based with LLM fallback)
        let attendeeResponseText: string = "";
        let chatMeta: { provider: string; model?: string } | undefined;
        let attendeeReplySource: "template" | "llm" = "llm";
        let attendeeIntent: string | undefined;
        let attendeeIntentConfidence: number | undefined;

        // Count trainee turns for deterministic variant selection
        const traineeTurnCount = session.transcript.filter((m) => m.type === "trainee").length;

        // Try template-based response first
        const templateResult = generateAttendeeReply({
          traineeText: message,
          session,
          traineeTurnCount,
        });

        if (templateResult) {
          // ... template branch ...
        } else {
          // Fallback to LLM if template didn't match
          try {
```

with:

```ts
        // 5) Generate attendee response.
        // The LLM serves every turn. A keyword template layer used to intercept most turns
        // before the model ran, which misrouted questions (e.g. "what does that cost you?"
        // -> a pricing objection) and force-changed the subject once a topic was marked
        // exhausted. See docs/superpowers/specs/2026-08-19-attendee-realism-engine-design.md.
        let attendeeResponseText: string = "";
        let chatMeta: { provider: string; model?: string } | undefined;
        const attendeeReplySource: "llm" = "llm";

        {
          try {
```

Then remove the now-dangling `attendeeReplySource = "llm";` assignments inside the try/catch
ladder (they are redundant with the const) and keep every `span.setAttribute(...)` call.

- [ ] **Step 3: Verify no template references remain**

Run: `grep -rn "generateAttendeeReply\|attendeeIntent\|expressedIntents\|templateResult" "app/api/session/[id]/message/route.ts"`
Expected: no output.

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "app/api/session/[id]/message/route.ts"
git commit -m "fix: let the LLM answer every attendee turn

Removes the keyword template interception layer from the request path. It answered
most turns before the model ran, misrouting questions on substring matches and
railroading toward close via intent exhaustion."
```

---

## Task 7: Delete the template layer and its session fields

**Files:**
- Delete: `lib/attendee/templates.ts`, `intentClassifier.ts`, `intentClassifier.ts.bak`, `intentTypes.ts`, `variantPicker.ts`, `generateAttendeeReply.ts`
- Modify: `lib/storage.ts`

- [ ] **Step 1: Confirm nothing outside the deleted set references these**

Run:

```bash
grep -rn "intentTypes\|AttendeeIntent\|generateAttendeeReply\|pickVariant\|DEFAULT_TOOL_STACKS" app components lib scripts | grep -v "^lib/attendee/"
```

Expected: no output. (Verified during design; re-confirm before deleting.)

- [ ] **Step 2: Delete the files**

```bash
git rm lib/attendee/templates.ts lib/attendee/intentClassifier.ts \
       lib/attendee/intentClassifier.ts.bak lib/attendee/intentTypes.ts \
       lib/attendee/variantPicker.ts lib/attendee/generateAttendeeReply.ts
```

- [ ] **Step 3: Remove the template-only session fields**

In `lib/storage.ts`, delete these fields from `interface SessionState`:

```ts
  toolingContext?: {
    apm?: string;
    logs?: string;
    stack?: string;
  };

  expressedIntents?: string[];
```

`toolingContext` was populated by `getDefaultToolStack()`, which keyed off the persona's job
title and overrode the scenario's stated `Tooling bias` — the `qcon-startup-cto` OSS-first
scenario was being answered with "New Relic and Splunk". Tooling consistency now comes from
the scenario profile and the transcript, which is strictly more faithful.

- [ ] **Step 4: Verify the build**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; postProcess and lengthBudget tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A lib/attendee lib/storage.ts
git commit -m "refactor: delete the attendee template layer

Removes templates, the substring intent classifier, variant picker, and their
session fields. getDefaultToolStack keyed off job title and contradicted each
scenario's stated tooling bias, so scenario fidelity improves with its removal."
```

---

## Task 8: Rewrite the prompt bundle as voice and character

Executes the spec §6.1 triage: 7 deletions, 5 rescopes, 6 duplications removed. Behavior rules
belong in `lib/simulator.config.json`, which the composer already renders.

**Files:**
- Modify: `lib/llm/defaultPromptBundle.ts`

- [ ] **Step 1: Replace `MASTER_SYSTEM_PROMPT_V1`**

Replace the entire `MASTER_SYSTEM_PROMPT_V1` template literal with:

```ts
const MASTER_SYSTEM_PROMPT_V2 = `
WHO YOU ARE
You are the attendee. The person you are talking to is a Honeycomb booth staffer in training.
You walked up to their booth. Your hidden profile is provided separately - never state it
outright. It shows through what you care about, what you complain about, and the words you use.

WHAT YOU WANT
You are deciding whether this conversation is worth more of your time. You are not trying to
buy anything, and you are not here to help the staffer do well. You are busy, a little
skeptical, and mildly distracted.

HOW YOU TALK
Natural, imperfect speech. Contractions. Occasional trailing thoughts.
Sound like a tired engineer in a loud hall, not a written paragraph.
No lists, no markdown, no stage directions, no asterisks.
Convey your mood through word choice, never by narrating your own feelings or state.
Do not end your turn by lobbing the question back at them.

WHAT YOU DO NOT DO
- Do not volunteer your problems. Wait for a question worth answering.
- Do not name Honeycomb features or internal product terminology. If the staffer introduces a
  term, you may acknowledge it plainly without expanding on it.
- Do not explain Honeycomb's value or argue its case. That is the staffer's job, not yours.
- Do not run the discovery. They ask; you answer.
- Do not offer to scan your own badge, to follow up with them, or to schedule anything. You
  may ask THEM to scan your badge or to have someone reach out.
- Do not walk away right after asking a question. Stay for the answer.
- Do not end the conversation because the staffer is doing badly. Get shorter and cooler instead.

ANSWERING QUESTIONS
Answer what was actually asked.
If they ask what you do or what you are responsible for, tell them. That question always earns
a real answer.
If they ask what you use today, name your actual tools plainly - real engineers know their stack.
If they ask something you would not know, or something that needs real depth, say so and ask
whether there is someone technical around.

YOUR FIRST FEW TURNS
Assume nothing about your architecture, your migrations, or your gaps. Do not bring up
microservices, migrations, or tracing until the staffer raises the subject.

WHEN YOU OPEN UP
Guardedness is your default. Being genuinely listened to is what changes it.
If they acknowledge what you said, ask a real follow-up, or let you finish a complaint without
pivoting to a pitch, give them more: more specifics, more consequence, more candor. A real
story is something you tell someone who has earned it.
If they pitch before understanding you, talk over your complaint, or ask a leading question,
pull back. Shorter. Flatter. Less detail. Never announce that you are doing this.

WHEN YOU PUSH BACK
Once the staffer starts describing how this might help you, you may challenge them - how it
differs from what you already run, what adopting it would actually cost you in effort.
Ask as a busy practitioner asking about your own situation. Do not interview them about the
industry, about other teams, or about philosophy.

HOW THIS ENDS
Plenty of good booth conversations end without a demo. Deferred interest, a pointer to docs or
a free tier, a request for follow-up, or a polite exit are all legitimate and sometimes the
correct ending.
Only agree to a next step you would genuinely accept, given what you have actually heard.
`.trim();
```

- [ ] **Step 2: Update the bundle export**

Update the bundle object at the bottom of the file:

```ts
export const DEFAULT_PROMPT_BUNDLE_V1: PromptBundle = {
  id: "default",
  version: "v2.0.0",
  updatedAt: "2026-08-19T00:00:00Z",
  facilitatorSetup: FACILITATOR_SETUP_V1,
  masterSystemPrompt: MASTER_SYSTEM_PROMPT_V2,
  postSessionRubric: POST_SESSION_RUBRIC_V1,
  notes:
    "v2.0.0: Thin voice/character bundle. Behavior rules now live solely in simulator.config.json. " +
    "Removed SUCCESS OPTIMIZATION (told the attendee to help trainees earn A/B grades), " +
    "REALISTIC CONVERSATION ARC (fixed 5-step script), ACTIVE LISTENING (assigned the trainee's " +
    "job to the attendee), QUESTION BALANCE, DISCOVERY QUESTION STYLE, the 12-question " +
    "Honeycomb-specific list, and MQL CONVERGENCE PROTOCOL (1-turn close). " +
    "See docs/superpowers/specs/2026-08-19-attendee-realism-engine-design.md section 6.1.",
};
```

- [ ] **Step 3: Confirm the config still supplies the behavior rules**

Run: `grep -n "keyword_restrictions\|role_boundaries\|states\|stakeholder_types" lib/simulator.config.json | head`
Expected: `keyword_restrictions`, `states`, and `stakeholder_types` are present. If
`role_boundaries` is absent, add it to `lib/simulator.config.json` capturing the badge-scan
direction rule (spec §6.1 row 2) and confirm `renderSimulatorRules()` emits it.

- [ ] **Step 4: Verify the composed prompt shrank and kept the essentials**

Run: `npx tsc --noEmit`
Expected: no errors.

Then confirm the deleted directives are gone:

```bash
grep -rn "A or B grades\|CONVERGE NOW\|1 TURN CLOSE\|DISALLOWED QUESTIONS" lib/
```

Expected: no output from `defaultPromptBundle.ts`. (`promptComposer.ts` still has
`CONVERGE NOW` — Task 9 removes it.)

- [ ] **Step 5: Commit**

```bash
git add lib/llm/defaultPromptBundle.ts lib/simulator.config.json
git commit -m "refactor: thin the prompt bundle to voice and character

Executes the spec section 6.1 triage. Deletes SUCCESS OPTIMIZATION, which told the
attendee its goal was helping trainees achieve A or B grades, and REALISTIC
CONVERSATION ARC, a fixed 5-step script the attendee followed regardless of what the
trainee said. Behavior rules now live only in simulator.config.json."
```

---

## Task 9: Stop the composer contradicting the bundle

`promptComposer.ts` is a third source of behavioral truth. Its MQL block instructs the attendee
to say "Let me scan your badge" — the exact role reversal the bundle forbids.

**Files:**
- Modify: `lib/llm/promptComposer.ts`

- [ ] **Step 1: Replace the turn-limit injection (7a)**

Replace the `if (context.turnLimitExceeded)` block body with:

```ts
    sections.push(`\nTIME PRESSURE
You have spent a while at this booth and need to move on soon. Keep replies short and start
looking for a natural end. That end may be a next step, or it may simply be a polite exit -
whichever honestly fits what you have heard so far.`);
```

- [ ] **Step 2: Replace the self-service injection (7b)**

Replace the `if (context.selfServiceCuesDetected)` block body with:

```ts
    sections.push(`\nSELF-SERVICE PATH OFFERED
The staffer has pointed you toward something you can explore on your own. If that genuinely
suits how you like to evaluate tools, accepting it is a perfectly good ending.`);
```

- [ ] **Step 3: Replace the MQL injection (7c)**

Replace the `if (context.mqlCuesDetected)` block body with:

```ts
    sections.push(`\nFOLLOW-UP PATH OFFERED
The staffer has offered a follow-up path - a badge scan, a colleague reaching out, or an
introduction. If that genuinely fits what you need, you may accept it plainly and wrap up.
Remember the direction: they scan your badge and they follow up with you. Never offer to scan
your own badge or to follow up with them.`);
```

- [ ] **Step 4: Soften the stakeholder injections (7d)**

Replace both stakeholder blocks with priors rather than outcome mandates:

```ts
  if (context.stakeholderType === "executive") {
    sections.push(`\nWHAT YOU WEIGH
You are senior enough that your attention is on cost, delivery risk, customer impact, and
whether your teams can actually adopt something. You may still want to see the tool - do not
rule that out - but hands-on detail matters less to you than consequence.`);
  } else if (context.stakeholderType === "ic_without_authority") {
    sections.push(`\nWHAT YOU WEIGH
You do the hands-on work but you do not control the budget. If something looks genuinely
useful, your instinct is to work out how you would make the case internally.`);
  }
```

- [ ] **Step 5: Inject the length directive**

Add the import at the top of `lib/llm/promptComposer.ts`:

```ts
import { getLengthBudget, renderLengthDirective } from "../attendee/lengthBudget";
```

Then insert immediately before the `// 9. Final instruction` line:

```ts
  // 8b. Reply length budget (phase-derived; trust-aware in Phase 2)
  sections.push(`\n${renderLengthDirective(getLengthBudget(context.sessionState))}`);
```

- [ ] **Step 6: Verify no converge-now directives remain**

Run: `grep -rn "CONVERGE NOW\|within 1-2 turns\|Preferred outcome\|Let me scan your badge" lib/`
Expected: no output.

- [ ] **Step 7: Verify it compiles and tests pass**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; all tests pass.

- [ ] **Step 8: Commit**

```bash
git add lib/llm/promptComposer.ts
git commit -m "fix: stop the composer contradicting the prompt bundle

The MQL injection instructed the attendee to say 'Let me scan your badge' - the exact
role reversal the bundle's role guardrails forbid. Turn-limit, self-service, MQL, and
stakeholder injections all pushed premature closing; they now describe what the
attendee weighs instead of mandating an outcome. Also injects the length budget."
```

---

## Task 10: Verify the phase end to end

- [ ] **Step 1: Full validation**

Run: `npm run validate`
Expected: JSON config valid, MQL detection script passes, unit tests pass, build succeeds.

- [ ] **Step 2: Start the app with the gateway enabled**

Confirm `.env.local` has `CHAT_PROVIDER="gateway"` and `ATTENDEE_MODEL` set to the slug
recorded in Task 4, then:

```bash
npm run dev
```

- [ ] **Step 3: Run the regression conversation that used to fail**

Start a session against the `direng_migration_medium` scenario and send, in order:

1. `Hey, how long have you been at the conference?`
   Expected: an icebreaker answer about the conference. **Must not** be a rollout-effort
   objection (the old `how long` substring misfire).
2. `What do you work on day to day?`
   Expected: a real role answer consistent with Director of Engineering.
3. `What are you using for observability today?`
   Expected: names tools consistent with the scenario's `Tooling bias`
   (legacy APM + logs/metrics), **not** a generic default stack.
4. `That sounds rough. What does that actually cost you when it happens?`
   Expected: an answer about impact. **Must not** be "We're cost-conscious. How does pricing
   work?" (the old `cost` substring misfire).
5. `Tell me more about that last incident.`
   Expected: a longer, more specific reply than turn 1 — more than two sentences.
6. Probe pain a third time.
   Expected: deeper disclosure. **Must not** pivot to "what's next" / closing.

- [ ] **Step 4: Confirm no state leakage or formatting artifacts**

Read the transcript. Expected: no parentheses narration, no bullets, no asterisks, no
"(Moves into PAIN DISCOVERY)", no Honeycomb feature names volunteered by the attendee.

- [ ] **Step 5: Commit any fixes, then tag the gate**

```bash
git add -A
git commit -m "test: verify phase 1 attendee behavior end to end"
```

**GATE — stop here.** Phase 1 is complete and ready for Rick to judge in a live session.
Do not begin Phase 2 until he has run a conversation and confirmed the attendee feels real.
Phase 2's step-level plan is written after that, so trust/guard thresholds can be set against
observed sessions rather than guessed.

---

## Phase 2 — outline only

Written as a separate plan document after the Phase 1 gate. Interfaces are already fixed in
spec §5.

| Task | Deliverable |
|---|---|
| 1 | `lib/attendee/state.ts` — `TurnSignals` and `AttendeeState` types (spec §5.1, §5.2) |
| 2 | `lib/attendee/judge.ts` — `generateObject` call with a Zod schema, `JUDGE_MODEL`, neutral-signal degradation on failure |
| 3 | `lib/attendee/reducer.ts` — pure reducer, thresholds from `simulator.config.json`, TDD against spec §9's assertions |
| 4 | `lib/attendee/revealBudget.ts` — budget derivation and natural-language directive rendering; `lengthBudget` becomes trust-aware |
| 5 | Route pipeline — judge → reduce → generate; persist signals and state snapshot |
| 6 | Fold `advanceState` / `determineOutcome` into the reducer, preserving the `1163f30` outcome gating |
| 7 | OTel turn attributes — signals, trust/guard/engagement deltas, budget, vent allowed/fired, transition reasons |
| 8 | Admin-gated debug view rendering per-turn signals, state, and budget |

Phase 2 adds `zod` as a dependency for the judge schema.

---

## Self-Review

**Spec coverage:** §2.1 → Tasks 6, 7. §2.2 → Tasks 6, 7. §2.3 → Task 7 step 3. §2.4 → Task 2.
§2.5 → Tasks 8, 9. §2.6 → Task 8. §2.7 → Tasks 8, 9. §6.1 triage → Task 8. §6.2 length policy
→ Tasks 2, 3, 9 step 5. §6.3 model routing → Tasks 4, 5. §7 error handling → Task 5 step 3
(`withMockFallback`). §10 Phase 1 acceptance → Task 10. §5, §8, §9 (judge/reducer/observability/
tests) → Phase 2 outline, deliberately deferred.

**Type consistency:** `LengthBudget` is defined in Task 3 and consumed in Task 9 step 5 with
matching `getLengthBudget(phase)` / `renderLengthDirective(budget)` signatures. `ChatProvider`,
`ChatInput`, and `ChatResult` match the existing interfaces in `lib/llm/chatTypes.ts` and
`lib/llm/chatProvider.ts`; the only change is widening the `provider` union, done in Task 5
step 1 before `GatewayChatProvider` returns `"gateway"`.

**Known verification point:** `maxOutputTokens` in Task 5 is the current AI SDK v5+/v6 name for
what was once `maxTokens`. Task 4 step 4 exercises it in the smoke script specifically so a
naming mismatch surfaces before it reaches the request path, with instructions to check the
live reference rather than guess.

---

## Execution log — 2026-08-19

The plan above was written against `main` (`84977bc`). Execution happened against the real
working branch `feat/director-reactive-booth-realism-step3`, which is ~11k lines ahead and
already contained a director/momentum/reactiveness layer. What actually changed:

**Dropped:** Tasks 6–7 (delete the template layer). That layer is deliberate recent work, so
it was kept.

**Added, and it turned out to be the linchpin:** measurement showed the template layer was
answering **100% of turns** — 0 of 360 sampled turns reached the LLM (6 personas × 3 states ×
20 prompt shapes). Every planned prompt/cap/model fix would therefore have had *zero*
observable effect. `lib/attendee/replyPolicy.ts` now splits turns by kind: templates keep
factual/scripted turns, the LLM takes expressive ones. Measured after: tool questions 48/48
template, expressive 48/48 LLM.

**Corrections to the spec's diagnosis, on the record:**
- The crude substring `intentClassifier` is dead code on this branch — not imported. The
  "cost → pricing objection" example does not reproduce here.
- `momentumModel` is not a trust/guard model; its own header says "no behavior changes".
- The prompt-layer critique survived fully intact: the bundle was untouched at v1.7.0 with
  every harmful section present.
- `promptComposer` was a *third* source of behavioral truth, and its MQL block instructed the
  exact role reversal the bundle forbade.

**Also found and fixed:** `temperature: 0.4` / `max_tokens: 300` hardcoded in the OpenAI
provider (would have defeated the length budget); four `console.log("[ANSWER MODE]")`
statements writing trainee conversation to production logs.

**Blocked:** AI Gateway generation returns 403 `customer_verification_required` — it needs a
payment method on the Vercel team. Auth and model listing work (322 models). `CHAT_PROVIDER`
stays `openai` until then; the gateway path is wired behind the env var.

**Still open:**
- `personaValidation.test.ts` asserts primary pain surfaces in ≥30% of ICEBREAKER turns using
  non-pain prompts and an empty transcript. That contradicts "do not volunteer pain
  unprompted" — the test needs rewriting, not the code.
- Production reads the active bundle from KV, so the new v2.0.0 default does not take effect
  there until the active bundle is updated.
- Persona differentiation on the template path is still weak (DevOps and TDM returned
  identical pain text; several personas never hit their primary pain anchors).
- Phase 2: judge → reducer → reveal budget, so openness is earned rather than phase-derived.
