export type Difficulty = "easy" | "medium" | "hard";

export type Conference = {
  id: string;
  name: string;
  themes: string[];
  seniorityMix: string;
  observabilityMaturity: string; // "Low"|"Medium"|"High" preferred but string ok
  sources?: {
    urls?: string[];
    prospectus?: { filename: string; url?: string };
  };
  createdAt: string;
  createdBy: "system" | "admin";
  updatedAt?: string;
  isArchived?: boolean; // soft delete
};

export type Persona = {
  id: string;
  name: string;
  personaType: string;
  modifiers: string[];
  emotionalPosture: string;
  toolingBias: string;
  otelFamiliarity: "never" | "aware" | "considering" | "starting" | "active";
  sources?: {
    urls?: string[];
    pdfs?: Array<{ filename: string; url?: string }>;
    notes?: string;
  };
  behaviorBrief?: string;
  displaySubtitle?: string; // Full caption for display in editor lists
  createdAt: string;
  createdBy: "system" | "admin";
  updatedAt?: string;
  isArchived?: boolean;

  // NEW FIELDS - Added for persona-driven response generation
  isBuyer?: boolean; // Only true for TDM, defaults to false for IC personas

  painAnchors?: Array<{
    id: string; // Unique identifier for this pain (e.g., "oncall-pain")
    pain: string; // Canonical pain as persona speaks it
    keywords: string[]; // Keywords triggering this pain
    priority: "primary" | "secondary";
    testPhrases: string[]; // Phrases to test for in automated validation (handles paraphrasing)
  }>;

  questionBank?: Array<{
    question: string;
    category: "discovery" | "technical" | "evaluation" | "objection";
    triggerContext?: string;
  }>;

  objectionBank?: Array<{
    objection: string;
    type: "cost" | "effort" | "technical" | "timing" | "proof";
    rebuttalHint?: string;
  }>;

  toolStackOptions?: Array<{
    variant: string; // e.g., "Prometheus + Grafana + Loki"
    tools: string[]; // Individual tool names
    context?: string;
  }>;
};

export type ScenarioSelection = {
  conferenceId: string;
  personaId: string;
  difficulty: Difficulty;
};
