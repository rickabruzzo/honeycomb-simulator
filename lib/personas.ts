import config from "./simulator.config.json";

export type PersonaPreset = {
  id: string;
  name: string;
  difficulty: "easy" | "medium" | "hard";
  conferenceContext: string;
  attendeeProfile: string;
};

export const PERSONAS: PersonaPreset[] = (config as any).personas ?? [];

export function getPersonaById(id: string): PersonaPreset | undefined {
  return PERSONAS.find((p) => p.id === id);
}