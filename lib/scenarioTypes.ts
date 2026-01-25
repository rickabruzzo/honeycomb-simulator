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
  createdAt: string;
  createdBy: "system" | "admin";
  updatedAt?: string;
  isArchived?: boolean;
};

export type ScenarioSelection = {
  conferenceId: string;
  personaId: string;
  difficulty: Difficulty;
};
