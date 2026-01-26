import { findPersonaByName, upsertPersona } from "./personaStore";
import { Persona } from "./scenarioTypes";

/**
 * Seed personas for Scenarios A-F
 * Idempotent: Only creates personas that don't already exist by normalized name
 */
export async function seedScenarioPresets(): Promise<void> {
  const now = new Date().toISOString();

  const scenarioPersonas: Omit<Persona, "displaySubtitle">[] = [
    // Scenario A: KubeCon / Platform Engineer
    {
      id: "scenario-a-platform-eng",
      name: "Platform Engineer (Scenario A)",
      personaType: "Platform Engineer",
      modifiers: ["Datadog cost pressure", "Growing microservices"],
      emotionalPosture: "Wry, burned out",
      toolingBias: "Datadog + Grafana",
      otelFamiliarity: "starting",
      behaviorBrief:
        "Platform Engineer with wry, burned out posture. Datadog cost pressure, Growing microservices",
      createdAt: now,
      createdBy: "system",
    },
    // Scenario B: SREcon / SRE
    {
      id: "scenario-b-sre",
      name: "Site Reliability Engineer (Scenario B)",
      personaType: "Site Reliability Engineer",
      modifiers: ["On-call war story", "Recent outage", "OSS-first"],
      emotionalPosture: "Skeptical, tired",
      toolingBias: "Prometheus + Grafana",
      otelFamiliarity: "aware",
      behaviorBrief:
        "Site Reliability Engineer with skeptical, tired posture. On-call war story, Recent outage, OSS-first",
      createdAt: now,
      createdBy: "system",
    },
    // Scenario C: KubeCon + CloudNativeCon / Senior Fullstack Developer
    {
      id: "scenario-c-fullstack-dev",
      name: "Senior Fullstack Developer (Scenario C)",
      personaType: "Senior Fullstack Developer",
      modifiers: ["Backend traces exist", "Frontend blamed"],
      emotionalPosture: "Candid, annoyed",
      toolingBias: "OTel backend only, roll-your-own",
      otelFamiliarity: "starting",
      behaviorBrief:
        "Senior Fullstack Developer with candid, annoyed posture. Backend traces exist, Frontend blamed",
      createdAt: now,
      createdBy: "system",
    },
    // Scenario D: AWS re:Invent / Director of Engineering
    {
      id: "scenario-d-director-eng",
      name: "Director of Engineering (Scenario D)",
      personaType: "Director of Engineering",
      modifiers: ["Migrating monolith to microservices", "Growing blind spots"],
      emotionalPosture: "Thoughtful, time-constrained",
      toolingBias: "Legacy APM + logs/metrics",
      otelFamiliarity: "aware",
      behaviorBrief:
        "Director of Engineering with thoughtful, time-constrained posture. Migrating monolith to microservices, Growing blind spots",
      createdAt: now,
      createdBy: "system",
    },
    // Scenario E: AWS re:Invent / Technical Buyer
    {
      id: "scenario-e-tech-buyer",
      name: "Technical Buyer (Scenario E)",
      personaType: "Technical Buyer",
      modifiers: ["Teams lack visibility", "Legacy tooling slows delivery"],
      emotionalPosture: "Curious, slightly defensive",
      toolingBias: "Logs + metrics",
      otelFamiliarity: "considering",
      behaviorBrief:
        "Technical Buyer with curious, slightly defensive posture. Teams lack visibility, Legacy tooling slows delivery",
      createdAt: now,
      createdBy: "system",
    },
    // Scenario F: QCon EMEA / CTO (Startup)
    {
      id: "scenario-f-cto-startup",
      name: "CTO (Startup) (Scenario F)",
      personaType: "CTO (Startup)",
      modifiers: ["Greenfield tooling decisions", "Strong OSS bias"],
      emotionalPosture: "Confident, analytical",
      toolingBias: "OSS-first; we can build it",
      otelFamiliarity: "considering",
      behaviorBrief:
        "CTO (Startup) with confident, analytical posture. Greenfield tooling decisions, Strong OSS bias",
      createdAt: now,
      createdBy: "system",
    },
  ];

  let seededCount = 0;
  for (const personaData of scenarioPersonas) {
    // Check if persona exists by normalized name
    const existing = await findPersonaByName(personaData.name);
    if (existing) {
      // Already exists, skip
      continue;
    }

    // Create new persona (upsertPersona will generate displaySubtitle)
    await upsertPersona(personaData);
    seededCount++;
  }

  if (seededCount > 0) {
    console.log(`[SeedScenarioPresets] Seeded ${seededCount} scenario personas`);
  }
}
