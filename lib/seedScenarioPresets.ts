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
      name: "Platform Engineer",
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
      name: "Site Reliability Engineer",
      personaType: "Site Reliability Engineer",
      modifiers: ["Recent outage", "Alert fatigue"],
      emotionalPosture: "Guarded, blunt",
      toolingBias: "Prometheus + Grafana + ELK Stack",
      otelFamiliarity: "considering",
      behaviorBrief:
        "Site Reliability Engineer with guarded, blunt posture. Recent outage, Alert fatigue",
      createdAt: now,
      createdBy: "system",
    },
    // Scenario C: KubeCon + CloudNativeCon / Senior Fullstack Developer
    {
      id: "scenario-c-fullstack-dev",
      name: "Senior Fullstack Developer",
      personaType: "Senior Fullstack Developer",
      modifiers: ["Backend traces exist", "Frontend blamed"],
      emotionalPosture: "Candid, annoyed",
      toolingBias: "OTel backend only; internal roll-your-own tooling",
      otelFamiliarity: "starting",
      behaviorBrief:
        "Senior Fullstack Developer with candid, annoyed posture. Backend traces exist, Frontend blamed",
      createdAt: now,
      createdBy: "system",
    },
    // Scenario D: AWS re:Invent / Director of Engineering
    {
      id: "scenario-d-director-eng",
      name: "Director of Engineering",
      personaType: "Director of Engineering",
      modifiers: ["Migrating monolith to cloud microservices", "Growing blind spots"],
      emotionalPosture: "Thoughtful, concerned, time-constrained",
      toolingBias: "Legacy APM + logs/metrics",
      otelFamiliarity: "aware",
      behaviorBrief:
        "Director of Engineering with thoughtful, concerned, time-constrained posture. Migrating monolith to cloud microservices, Growing blind spots",
      createdAt: now,
      createdBy: "system",
    },
    // Scenario E: AWS re:Invent / Technical Buyer
    {
      id: "scenario-e-tech-buyer",
      name: "Technical Buyer",
      personaType: "Technical Buyer",
      modifiers: ["Teams lack visibility", "Legacy tooling slows delivery"],
      emotionalPosture: "Curious, slightly defensive, pragmatic",
      toolingBias: "Logs + metrics; it's worked fine so far",
      otelFamiliarity: "considering",
      behaviorBrief:
        "Technical Buyer with curious, slightly defensive, pragmatic posture. Teams lack visibility, Legacy tooling slows delivery",
      createdAt: now,
      createdBy: "system",
    },
    // Scenario F: QCon / CTO (Startup)
    {
      id: "scenario-f-cto-startup",
      name: "CTO (Startup)",
      personaType: "CTO (Startup)",
      modifiers: ["Greenfield tooling decisions", "Strong OSS bias"],
      emotionalPosture: "Confident, analytical, cost-sensitive",
      toolingBias: "OSS-first mindset; we can build it",
      otelFamiliarity: "considering",
      behaviorBrief:
        "CTO (Startup) with confident, analytical, cost-sensitive posture. Greenfield tooling decisions, Strong OSS bias",
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
