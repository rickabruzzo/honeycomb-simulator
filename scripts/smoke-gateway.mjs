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
const res = await generateText({
  model,
  system:
    "You are a tired SRE at a conference booth, mid-conversation. Natural imperfect speech. No lists, no markdown, no stage directions.",
  messages: [
    { role: "user", content: "That sounds rough. What does an incident like that actually cost you?" },
  ],
  temperature: 0.8,
  maxOutputTokens: 600,
});
console.log(res.text);
console.log("\nusage:", res.usage);
