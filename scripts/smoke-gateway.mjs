/**
 * Gateway connectivity + model discovery.
 *
 * Usage: node --env-file=.env.local scripts/smoke-gateway.mjs
 *
 * Gateway model slugs version with dots (anthropic/claude-sonnet-4.6, not -4-6) and the
 * catalog changes, so resolve them here rather than hardcoding from memory. Put the chosen
 * ids in ATTENDEE_MODEL and JUDGE_MODEL.
 */
import { gateway, generateText } from "ai";

const raw = await gateway.getAvailableModels();
const ids = (raw.models ?? raw).map((m) => m.id).sort();

console.log(`${ids.length} models available\n`);
console.log("--- frontier candidates (attendee) ---");
console.log(ids.filter((id) => /(claude-(sonnet|opus))|gpt-5/.test(id)).join("\n") || "(none matched)");
console.log("\n--- small/fast candidates (judge) ---");
console.log(ids.filter((id) => /haiku|mini|flash/.test(id)).join("\n") || "(none matched)");

const model =
  process.env.ATTENDEE_MODEL ||
  ids.find((id) => /claude-sonnet/.test(id)) ||
  ids.find((id) => /gpt-5/.test(id));

console.log(`\n--- generating with ${model} ---`);
try {
  const res = await generateText({
    model,
    system:
      "You are a tired SRE at a conference booth, mid-conversation. Natural imperfect speech. No lists, no markdown, no stage directions.",
    messages: [
      {
        role: "user",
        content: "That sounds rough. What does an incident like that actually cost you?",
      },
    ],
    temperature: 0.8,
    maxOutputTokens: 600,
  });
  console.log(res.text);
  console.log("\nusage:", res.usage);
  console.log("\nGateway is working. Set CHAT_PROVIDER=gateway to use it.");
} catch (error) {
  // The gateway's failure modes are all billing-shaped and the raw stack is 100+ lines,
  // so translate them into the one action that actually unblocks each case.
  const body = String(error?.cause?.responseBody ?? error?.message ?? error);
  const status = error?.statusCode ?? error?.cause?.statusCode;

  let advice;
  if (/RestrictedModelsError|Free tier users do not have access/.test(body)) {
    advice = [
      `Model listing works, but generating with ${model} is blocked: this team is on the free tier.`,
      "",
      "A card on file is NOT enough - Vercel gates model access behind purchased credits.",
      "Top up at: Vercel dashboard > your team > AI > Top up",
      "",
      "Until then use direct OpenAI instead, which needs no gateway credits:",
      '  CHAT_PROVIDER="openai"',
      '  OPENAI_CHAT_MODEL="gpt-5.2"',
    ].join("\n");
  } else if (/credit card|customer_verification_required/.test(body)) {
    advice = [
      "The gateway needs a payment method on the Vercel team before serving requests.",
      "Add one at: Vercel dashboard > your team > AI",
    ].join("\n");
  } else if (status === 429) {
    advice = "Rate limited by the gateway. Retry shortly, or check per-user rate limits in project settings.";
  } else if (status === 402) {
    advice = "Gateway budget exhausted. Add credits or raise the budget in project settings.";
  } else {
    advice = `Unexpected gateway error (status ${status ?? "unknown"}):\n${body.slice(0, 500)}`;
  }

  console.error("\n" + advice);
  process.exit(1);
}
