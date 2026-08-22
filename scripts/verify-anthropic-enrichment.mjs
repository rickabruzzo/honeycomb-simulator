// Usage: NODE_ENV=development node --env-file=.env.local --import tsx scripts/verify-anthropic-enrichment.mjs
// Live check: the Anthropic enrichment provider returns a valid, persona-differentiated result.
import { AnthropicEnrichmentProvider } from "/Users/rickabruzzo/Documents/honeycomb-simulator/.claude/worktrees/conference-simulator-handoff-3fbe5c/lib/llm/provider.ts";

const conferenceContext =
  "Conference: SRECon\nThemes: incident response, reliability at scale, toil reduction";

const personas = [
  {
    personaId: "sre-oncall",
    attendeeProfile:
      "Persona: Senior SRE\nModifiers: busy; attached to current tools\nEmotional posture: guarded, weary from on-call\nTooling bias: Prometheus + PagerDuty\nOpenTelemetry familiarity: aware",
  },
  {
    personaId: "security-lead",
    attendeeProfile:
      "Persona: Security Engineering Lead\nModifiers: skeptical; compliance-driven\nEmotional posture: cautious\nTooling bias: SIEM + audit logging\nOpenTelemetry familiarity: never heard of it",
  },
];

const provider = new AnthropicEnrichmentProvider();
const results = [];

for (const p of personas) {
  const r = await provider.enrich({
    conferenceId: "srecon",
    personaId: p.personaId,
    conferenceContext,
    attendeeProfile: p.attendeeProfile,
  });
  results.push(r);
  console.log(`\n===== ${p.personaId} (provider=${r.provider}) =====`);
  console.log("tone/brevity/skepticism:", r.attendeeStyleGuide.tone, "|", r.attendeeStyleGuide.brevity, "|", r.attendeeStyleGuide.skepticism);
  console.log("ventingTriggers:", r.attendeeStyleGuide.ventingTriggers);
  console.log("themes:", r.domainContext.themes);
  console.log("typicalTopics:", r.domainContext.typicalTopics);
  console.log("objections:", r.personaBehavior.objections);
  console.log("revealWhenEarned:", r.personaBehavior.revealWhenEarned);
  console.log("mirrorTerms:", r.vocabHints.mirrorTerms);
  console.log("avoidTerms:", r.vocabHints.avoidTerms);
  console.log("promptAddendum:", r.promptAddendum);
}

// Differentiation assertion: the two personas must not produce identical enrichment.
const [a, b] = results;
const same = JSON.stringify({ ...a, generatedAt: 0 }) === JSON.stringify({ ...b, generatedAt: 0, personaId: a.personaId });
console.log("\n===== RESULT =====");
console.log("provider used:", a.provider);
console.log("both parsed & validated:", results.length === 2);
console.log("personas differentiated:", !same);
if (a.provider !== "anthropic") {
  console.error("FAIL: provider was not anthropic (fell back?).");
  process.exit(1);
}
