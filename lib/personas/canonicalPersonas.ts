/**
 * Canonical Persona Definitions
 *
 * These 6 personas are extracted from "Persona Research by PMM.pdf" and represent
 * the complete set of supported personas for the discovery conversation simulator.
 *
 * Each persona includes:
 * - painAnchors: Top 2-3 pain points with keywords and test phrases
 * - questionBank: Realistic booth questions categorized by type
 * - objectionBank: Common objections this persona would raise
 * - toolStackOptions: Tool stack variants this persona might mention
 * - isBuyer: true ONLY for TDM, false for all IC personas
 */

import type { Persona } from "../scenarioTypes";

/**
 * SRE (Site Reliability Engineer) - IC Persona
 *
 * Key concerns:
 * - How quickly can we debug and resolve issues?
 * - How do I balance scaling needs with reliability targets?
 * - How do I minimize on-call pain?
 */
export const SRE_PERSONA: Persona = {
  id: "sre-canonical",
  name: "SRE (Site Reliability Engineer)",
  personaType: "Site Reliability Engineer",
  modifiers: ["technical", "reliability-focused", "hands-on"],
  emotionalPosture: "Pragmatic problem-solver, focused on reducing toil",
  toolingBias: "Prefers proven tools with strong community support",
  otelFamiliarity: "considering",
  behaviorBrief:
    "Owns reliability end to end: designs infrastructure to hit reliability targets, keeps services inside their error budgets, and owns debugging tooling and incident-response process. Measured on SLOs, app performance, downtime, and incident-resolution time. Cares most about resolving issues fast, balancing scaling against reliability, cutting on-call pain for developers without hurting user experience, and getting dev teams to actually instrument and adopt the tooling.",
  displaySubtitle: "IC • Director/Staff SRE • Owns SLOs, uptime & incident response",
  createdAt: new Date().toISOString(),
  createdBy: "system",
  isArchived: false,

  // NEW FIELDS
  isBuyer: false,

  painAnchors: [
    {
      id: "debug-speed",
      pain: "We need to debug issues faster. Our MTTR is too high.",
      keywords: ["debug", "troubleshoot", "mttr", "mean time", "resolve", "incident", "root cause"],
      priority: "primary",
      testPhrases: ["debug", "resolve issues", "mttr", "troubleshoot", "incident response"],
    },
    {
      id: "scaling-reliability",
      pain: "It's hard to balance scaling needs with our reliability targets.",
      keywords: ["scaling", "reliability", "slo", "sla", "error budget", "uptime", "availability"],
      priority: "primary",
      testPhrases: ["scaling", "reliability", "slo", "error budget", "uptime"],
    },
    {
      id: "oncall-pain",
      pain: "We're dealing with a lot of on-call pain. Alert fatigue is real.",
      keywords: ["on-call", "oncall", "pager", "alert", "fatigue", "noise", "wake up"],
      priority: "primary",
      testPhrases: ["on-call", "pager", "alert fatigue", "noisy alerts"],
    },
    {
      id: "dev-adoption",
      pain: "Getting my dev teams to actually instrument their code and adopt the tooling is a constant battle.",
      keywords: ["instrument", "adoption", "buy-in", "dev team", "onboard", "roll out", "get them to use"],
      priority: "secondary",
      testPhrases: ["dev buy-in", "get the team to instrument", "adoption", "instrument their code"],
    },
  ],

  questionBank: [
    {
      question: "Are you running into scaling issues with your current setup?",
      category: "discovery",
      triggerContext: "scaling",
    },
    {
      question: "What's your debugging workflow when you hit an unfamiliar incident?",
      category: "discovery",
    },
    {
      question: "Are you modernizing to OpenTelemetry, or still on proprietary agents?",
      category: "technical",
      triggerContext: "instrumentation",
    },
    {
      question: "How do you currently track SLOs and error budgets?",
      category: "technical",
      triggerContext: "reliability",
    },
    {
      question: "Do you have a free tier or sandbox we could try?",
      category: "evaluation",
    },
    {
      question: "Can you show me a quick demo of the debugging workflow?",
      category: "evaluation",
    },
  ],

  objectionBank: [
    {
      objection: "We're pretty lean on bandwidth right now. What's the instrumentation effort?",
      type: "effort",
      rebuttalHint: "Show auto-instrumentation capabilities",
    },
    {
      objection: "Our team is stretched thin. How much ongoing maintenance does this need?",
      type: "effort",
    },
    {
      objection: "We already have Prometheus and Grafana. Why would we switch?",
      type: "technical",
      rebuttalHint: "Highlight distributed tracing + correlation",
    },
  ],

  toolStackOptions: [
    {
      variant: "Prometheus + Grafana",
      tools: ["Prometheus", "Grafana"],
      context: "metrics",
    },
    {
      variant: "Prometheus + Grafana + Loki",
      tools: ["Prometheus", "Grafana", "Loki"],
      context: "metrics and logs",
    },
    {
      variant: "Datadog + ELK",
      tools: ["Datadog", "Elasticsearch", "Logstash", "Kibana"],
      context: "full observability stack",
    },
  ],
};

/**
 * DevOps Engineer - IC Persona
 *
 * Key concerns:
 * - How do I manage heterogeneous environments?
 * - How can I improve my debugging process?
 * - How do I prioritize where to improve?
 */
export const DEVOPS_PERSONA: Persona = {
  id: "devops-canonical",
  name: "DevOps Engineer",
  personaType: "DevOps Engineer / Principal Software Engineer",
  modifiers: ["generalist", "automation-focused", "cross-functional"],
  emotionalPosture: "Balancing multiple priorities, seeks automation wins",
  toolingBias: "Open to new tools if they reduce manual work",
  otelFamiliarity: "aware",
  behaviorBrief:
    "Automates how systems are configured and applications are built, deployed, and tested across heterogeneous, multi-cloud environments; defines tooling requirements and often collaborates with security, compliance, and build/release. Role scope varies and overlaps with Platform, Release, and SRE. Measured on deployment frequency, automation coverage, and MTTR. Shifting from aggregated metrics toward wide events and traces because there is always something that comes in sideways. Cares about modernizing environments, improving the debugging process, knowing where to focus improvements, and getting different teams onto common patterns.",
  displaySubtitle: "IC • Principal-level DevOps • Automation, multi-cloud & cross-team patterns",
  createdAt: new Date().toISOString(),
  createdBy: "system",
  isArchived: false,

  // NEW FIELDS
  isBuyer: false,

  painAnchors: [
    {
      id: "heterogeneous-envs",
      pain: "Managing all these different environments and tools is a nightmare.",
      keywords: ["heterogeneous", "multiple", "different tools", "environments", "stack", "fragmented"],
      priority: "primary",
      testPhrases: ["heterogeneous", "multiple environments", "different tools", "fragmented stack"],
    },
    {
      id: "debugging-process",
      pain: "Our debugging process is really inefficient. Too much context switching.",
      keywords: ["debug", "inefficient", "context switch", "jumping between", "correlation"],
      priority: "primary",
      testPhrases: ["debugging process", "context switching", "jumping between tools"],
    },
    {
      id: "prioritization",
      pain: "It's hard to know where to focus our improvement efforts.",
      keywords: ["prioritize", "focus", "where to start", "roi", "impact"],
      priority: "secondary",
      testPhrases: ["prioritize", "where to focus", "improvement efforts"],
    },
    {
      id: "common-patterns",
      pain: "Getting different teams to adopt common patterns and standard workflows is a constant fight.",
      keywords: ["common patterns", "standardize", "consistency", "across teams", "adoption", "workflows", "golden path"],
      priority: "secondary",
      testPhrases: ["common patterns", "standardize across teams", "adopt standard workflows"],
    },
  ],

  questionBank: [
    {
      question: "What tools do you use to debug production issues?",
      category: "discovery",
    },
    {
      question: "How do you approach onboarding new teams to observability?",
      category: "discovery",
      triggerContext: "adoption",
    },
    {
      question: "Does this work with our existing CI/CD pipeline?",
      category: "technical",
      triggerContext: "integration",
    },
    {
      question: "What's the learning curve for our team?",
      category: "evaluation",
    },
    {
      question: "Is there documentation we can review?",
      category: "evaluation",
    },
  ],

  objectionBank: [
    {
      objection: "We already have like five different monitoring tools. Do we really need another one?",
      type: "technical",
      rebuttalHint: "Show consolidation value",
    },
    {
      objection: "How hard is it to roll this out across multiple teams?",
      type: "effort",
    },
    {
      objection: "What's the cost compared to our current setup?",
      type: "cost",
    },
  ],

  toolStackOptions: [
    {
      variant: "Datadog + ELK",
      tools: ["Datadog", "Elasticsearch", "Logstash", "Kibana"],
      context: "metrics and logs",
    },
    {
      variant: "New Relic + Splunk + PagerDuty",
      tools: ["New Relic", "Splunk", "PagerDuty"],
      context: "full stack",
    },
    {
      variant: "Jenkins + GitLab CI + Prometheus",
      tools: ["Jenkins", "GitLab CI", "Prometheus"],
      context: "CI/CD focused",
    },
  ],
};

/**
 * Technical Decision-Maker (TDM) - BUYER Persona (ONLY BUYER)
 *
 * Key concerns:
 * - Does my team have the tools they need to be effective?
 * - How do I increase delivery velocity without burning people out?
 * - How do I keep retention high and burnout low?
 */
export const TDM_PERSONA: Persona = {
  id: "tdm-canonical",
  name: "Technical Decision-Maker",
  personaType: "Technical Decision-Maker / VP of Engineering / Head of Architecture",
  modifiers: ["buyer", "team-focused", "outcome-driven"],
  emotionalPosture: "Focused on team effectiveness and developer experience",
  toolingBias: "Values proven ROI and team productivity gains",
  otelFamiliarity: "aware",
  behaviorBrief:
    "Buyer. Hires and builds development teams, scopes and delivers key projects, and leads organizational change; measured on overall production results. Thinks in team effectiveness and business outcomes, not features. The system has grown too complex for individual engineers to find bottlenecks fast, so also cares about driving internal agreement across teams. Cares about whether the team has the tools to be effective, increasing delivery velocity without burning people out, measuring overall system health, keeping retention and morale high, and understanding cost and resource usage well enough to capacity-plan.",
  displaySubtitle: "BUYER • VP Eng / Head of Architecture • Velocity, retention & system health",
  createdAt: new Date().toISOString(),
  createdBy: "system",
  isArchived: false,

  // NEW FIELDS
  isBuyer: true, // ONLY TDM is a buyer

  painAnchors: [
    {
      id: "team-tooling",
      pain: "I'm not sure my team has the tools they need to be effective.",
      keywords: ["tools", "effective", "productivity", "developer experience", "devex", "friction"],
      priority: "primary",
      testPhrases: ["tools they need", "developer experience", "team productivity"],
    },
    {
      id: "delivery-velocity",
      pain: "We need to ship faster without burning everyone out.",
      keywords: ["velocity", "ship faster", "delivery", "burnout", "sustainable", "pace"],
      priority: "primary",
      testPhrases: ["delivery velocity", "ship faster", "burning out"],
    },
    {
      id: "retention",
      pain: "Retention is a concern. On-call and firefighting are wearing people down.",
      keywords: ["retention", "turnover", "morale", "on-call", "firefighting", "toil"],
      priority: "primary",
      testPhrases: ["retention", "wearing people down", "morale", "firefighting"],
    },
    {
      id: "cost-capacity",
      pain: "I need to understand our cost and resource usage well enough to capacity-plan and justify the spend.",
      keywords: ["cost", "resource usage", "capacity", "budget", "spend", "roi", "justify", "forecast"],
      priority: "secondary",
      testPhrases: ["cost and resource usage", "capacity plan", "justify the spend"],
    },
  ],

  questionBank: [
    {
      question: "What tools do you check every day to understand how things are going?",
      category: "discovery",
    },
    {
      question: "How do you determine what your team should prioritize?",
      category: "discovery",
    },
    {
      question: "How do you decide build versus buy for infrastructure tooling?",
      category: "discovery",
      triggerContext: "decision-making",
    },
    {
      question: "What does ROI look like for this kind of investment?",
      category: "evaluation",
    },
    {
      question: "How long does it take to see value?",
      category: "evaluation",
    },
    {
      question: "Can I get a badge scan for follow-up? I'd like to bring this to my team.",
      category: "evaluation",
    },
  ],

  objectionBank: [
    {
      objection: "We're capacity-constrained. What's the lift to get started?",
      type: "effort",
      rebuttalHint: "Show fast time-to-value",
    },
    {
      objection: "How do I justify the cost to leadership?",
      type: "cost",
      rebuttalHint: "Quantify productivity gains",
    },
    {
      objection: "We tried something similar before and adoption was low. How is this different?",
      type: "proof",
    },
  ],

  toolStackOptions: [
    {
      variant: "New Relic + Splunk",
      tools: ["New Relic", "Splunk"],
      context: "enterprise stack",
    },
    {
      variant: "Datadog + PagerDuty + Jira",
      tools: ["Datadog", "PagerDuty", "Jira"],
      context: "team workflow",
    },
  ],
};

/**
 * Build & Release Engineer - IC Persona
 *
 * Key concerns:
 * - How do I reduce build times?
 * - How do I improve test reliability (reduce flakiness)?
 * - How do I diagnose distributed environment problems?
 */
export const BUILD_RELEASE_PERSONA: Persona = {
  id: "build-release-canonical",
  name: "Build & Release Engineer",
  personaType: "Build & Release Engineer",
  modifiers: ["ci-cd-focused", "efficiency-driven", "technical"],
  emotionalPosture: "Focused on build speed and test reliability",
  toolingBias: "Values tools that integrate with CI/CD pipelines",
  otelFamiliarity: "starting",
  behaviorBrief:
    "Designs and maintains the CI/CD pipelines and works with dev teams to define build and test processes; the engineering teams are the internal customers, and security/compliance can be stakeholders. Measured on build time, test coverage/accuracy, and release frequency. Cares about reducing build times, cutting test flakiness, diagnosing failures in distributed build environments, and overall pipeline efficiency.",
  displaySubtitle: "IC • Staff-level Build/Release • Pipelines, build time & test reliability",
  createdAt: new Date().toISOString(),
  createdBy: "system",
  isArchived: false,

  // NEW FIELDS
  isBuyer: false,

  painAnchors: [
    {
      id: "build-times",
      pain: "Our build times are too slow. Developers are waiting around.",
      keywords: ["build time", "slow", "compile", "ci", "waiting", "pipeline"],
      priority: "primary",
      testPhrases: ["build times", "slow builds", "waiting for builds"],
    },
    {
      id: "test-flakiness",
      pain: "We have too many flaky tests. It's killing our confidence in CI.",
      keywords: ["flaky", "flakiness", "test reliability", "intermittent", "false positive"],
      priority: "primary",
      testPhrases: ["flaky tests", "test reliability", "intermittent failures"],
    },
    {
      id: "distributed-debugging",
      pain: "Diagnosing problems in our distributed build environment is really hard.",
      keywords: ["distributed", "build environment", "diagnose", "debug", "ci environment"],
      priority: "secondary",
      testPhrases: ["distributed environment", "build environment debugging"],
    },
  ],

  questionBank: [
    {
      question: "What CI/CD tools do you use?",
      category: "discovery",
    },
    {
      question: "How do you currently find slow or flaky tests?",
      category: "discovery",
    },
    {
      question: "Does this integrate with our build system?",
      category: "technical",
      triggerContext: "integration",
    },
    {
      question: "Can you show me how this helps with test observability?",
      category: "evaluation",
    },
    {
      question: "Is there a sandbox or trial we can use?",
      category: "evaluation",
    },
  ],

  objectionBank: [
    {
      objection: "How much overhead does instrumentation add to build times?",
      type: "technical",
      rebuttalHint: "Show minimal overhead",
    },
    {
      objection: "We're already using Jenkins and it's working okay. Why change?",
      type: "technical",
    },
    {
      objection: "What's the effort to instrument our test suite?",
      type: "effort",
    },
  ],

  toolStackOptions: [
    {
      variant: "Jenkins + GitLab CI",
      tools: ["Jenkins", "GitLab CI"],
      context: "CI/CD",
    },
    {
      variant: "CircleCI + GitHub Actions",
      tools: ["CircleCI", "GitHub Actions"],
      context: "modern CI/CD",
    },
    {
      variant: "BuildKite",
      tools: ["BuildKite"],
      context: "build orchestration",
    },
  ],
};

/**
 * Developer (on call) - IC Persona
 *
 * Key concerns:
 * - How do I quickly identify customer issues when on-call?
 * - How do I know how my code is performing in production?
 * - How do I reduce time spent on unplanned bug fixes?
 */
export const DEVELOPER_PERSONA: Persona = {
  id: "developer-canonical",
  name: "Developer (on call)",
  personaType: "Software Developer",
  modifiers: ["hands-on", "feature-focused", "on-call"],
  emotionalPosture: "Wants to ship features but frustrated by production issues",
  toolingBias: "Prefers simple tools that integrate with IDE and workflow",
  otelFamiliarity: "never",
  behaviorBrief:
    "Feature-focused engineer who rotates on-call. Builds and maintains applications, resolves security and performance issues, and refactors to keep up with emerging tech; measured on velocity, stability, and performance. Wants to ship without breaking the build or the org's software, and to actually know how the code performs — and whether anyone's even using it — once it's in production. Cares most about quickly identifying customer issues while on-call, especially after hours, and spending less time on unplanned bug fixes and more on roadmap work and tech debt.",
  displaySubtitle: "IC • Software Engineer • Ships features, on-call rotation",
  createdAt: new Date().toISOString(),
  createdBy: "system",
  isArchived: false,

  // NEW FIELDS
  isBuyer: false,

  painAnchors: [
    {
      id: "oncall-customer-issues",
      pain: "When I'm on-call, it's hard to quickly figure out what customers are hitting.",
      keywords: ["on-call", "customer", "issue", "identify", "triage", "production"],
      priority: "primary",
      testPhrases: ["on-call", "customer issues", "quickly identify"],
    },
    {
      id: "code-performance",
      pain: "I don't really know how my code is performing after I ship it — or whether anyone's even using it.",
      keywords: ["code performance", "production", "ship", "monitoring", "visibility", "being used", "adoption", "usage"],
      priority: "primary",
      testPhrases: ["code performing", "after shipping", "production visibility", "being used"],
    },
    {
      id: "bug-fix-time",
      pain: "I spend too much time on unplanned bug fixes instead of building features.",
      keywords: ["bug fix", "unplanned", "firefighting", "reactive", "features"],
      priority: "secondary",
      testPhrases: ["unplanned bug fixes", "firefighting", "building features"],
    },
  ],

  questionBank: [
    {
      question: "What's the most challenging part of your day-to-day work?",
      category: "discovery",
    },
    {
      question: "What's most frustrating about monitoring after you ship?",
      category: "discovery",
    },
    {
      question: "What's the most challenging part of being on-call?",
      category: "discovery",
      triggerContext: "on-call",
    },
    {
      question: "Does this work with our language and framework?",
      category: "technical",
      triggerContext: "integration",
    },
    {
      question: "Can I try this on my local dev environment first?",
      category: "evaluation",
    },
  ],

  objectionBank: [
    {
      objection: "I'm just trying to ship features. Do I really need to think about observability?",
      type: "timing",
      rebuttalHint: "Show how it saves debug time",
    },
    {
      objection: "This seems like a lot of setup. I barely have time as it is.",
      type: "effort",
    },
    {
      objection: "Can't I just use console.log and local logs?",
      type: "technical",
      rebuttalHint: "Show distributed tracing value",
    },
  ],

  toolStackOptions: [
    {
      variant: "Local logs + print debugging",
      tools: ["console.log", "local logs"],
      context: "current workflow",
    },
    {
      variant: "New Relic APM",
      tools: ["New Relic"],
      context: "application monitoring",
    },
    {
      variant: "Datadog APM",
      tools: ["Datadog"],
      context: "application monitoring",
    },
  ],
};

/**
 * Platform Engineer - IC Persona
 *
 * Key concerns:
 * - Do engineering teams have the tools they need?
 * - How do we understand costs and resource usage?
 * - How do we debug cross-system issues?
 */
export const PLATFORM_PERSONA: Persona = {
  id: "platform-canonical",
  name: "Platform Engineer",
  personaType: "Platform Engineer",
  modifiers: ["infrastructure-focused", "developer-enablement", "technical"],
  emotionalPosture: "Focused on enabling other developers and platform reliability",
  toolingBias: "Values scalable, self-service solutions",
  otelFamiliarity: "active",
  behaviorBrief:
    "Builds, budgets, and implements the tooling for deployment, pre-production testing, and observability, supports internal developer services, and assists in on-call rotations; platform teams span infra abstractions, developer tools, and backend product internals, and SREs often sit in this org. Measured on developer happiness/productivity and app latency/reliability. Cares about whether engineering teams have the tools to move fast and keep prod up, predicting and controlling cloud spend for capacity planning, debugging cross-system issues, and measuring and improving system and service health.",
  displaySubtitle: "IC • Platform lead • Internal dev platform, cloud spend & cross-system debugging",
  createdAt: new Date().toISOString(),
  createdBy: "system",
  isArchived: false,

  // NEW FIELDS
  isBuyer: false,

  painAnchors: [
    {
      id: "developer-tooling",
      pain: "I'm not sure if our engineering teams have the tools they need.",
      keywords: ["developer tools", "engineering teams", "platform", "self-service", "enablement"],
      priority: "primary",
      testPhrases: ["developer tools", "engineering teams", "tools they need"],
    },
    {
      id: "cost-visibility",
      pain: "We don't have good visibility into cloud costs and resource usage — I can't reliably predict or control our spend.",
      keywords: ["cost", "resource usage", "capacity", "spending", "efficiency", "cloud spend", "aws", "predict", "forecast"],
      priority: "primary",
      testPhrases: ["cost visibility", "resource usage", "capacity planning", "cloud spend", "predict spend"],
    },
    {
      id: "cross-system-debugging",
      pain: "Debugging issues that cross multiple systems is really painful.",
      keywords: ["cross-system", "distributed", "microservices", "correlation", "trace"],
      priority: "secondary",
      testPhrases: ["cross-system", "debugging across systems", "distributed tracing"],
    },
  ],

  questionBank: [
    {
      question: "How much time do your developers spend debugging versus building?",
      category: "discovery",
    },
    {
      question: "How does tool selection work at your company?",
      category: "discovery",
      triggerContext: "procurement",
    },
    {
      question: "Are you hitting any scaling issues with your platform?",
      category: "discovery",
      triggerContext: "scaling",
    },
    {
      question: "Does this support multi-tenancy for our internal teams?",
      category: "technical",
    },
    {
      question: "What's the admin overhead for managing this?",
      category: "evaluation",
    },
  ],

  objectionBank: [
    {
      objection: "We've built a lot of internal tooling. Can we integrate with that?",
      type: "technical",
      rebuttalHint: "Show API and integration options",
    },
    {
      objection: "What's the cost at our scale? We have hundreds of services.",
      type: "cost",
    },
    {
      objection: "How much effort is it to migrate from our current platform?",
      type: "effort",
    },
  ],

  toolStackOptions: [
    {
      variant: "Kubernetes + Prometheus + Grafana",
      tools: ["Kubernetes", "Prometheus", "Grafana"],
      context: "platform stack",
    },
    {
      variant: "Terraform + AWS CloudWatch + Datadog",
      tools: ["Terraform", "AWS CloudWatch", "Datadog"],
      context: "cloud platform",
    },
  ],
};

/**
 * All canonical personas for export
 */
export const ALL_CANONICAL_PERSONAS: Persona[] = [
  SRE_PERSONA,
  DEVOPS_PERSONA,
  TDM_PERSONA,
  BUILD_RELEASE_PERSONA,
  DEVELOPER_PERSONA,
  PLATFORM_PERSONA,
];

/**
 * Canonical persona IDs allowlist
 *
 * ONLY these persona IDs are allowed in the product.
 * All other personas (deprecated) are filtered out.
 */
export const CANONICAL_PERSONA_IDS = new Set([
  "sre-canonical",
  "devops-canonical",
  "tdm-canonical",
  "build-release-canonical",
  "developer-canonical",
  "platform-canonical",
]);
