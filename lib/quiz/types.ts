/**
 * Study-guide quiz types. The question bank itself is NOT in the repo (it includes pre-launch
 * content): it's authored in the gitignored content/study-guide/ folder, seeded to KV for
 * deployed environments, and read straight from disk in local dev. See lib/quiz/bank.ts.
 */

export interface QuizChoice {
  text: string;
  correct?: boolean;
  why_not?: string;
}

export interface TranscriptLine {
  who: "attendee" | "you";
  text: string;
}

export interface QuizQuestion {
  id: string;
  module: string; // module id, e.g. "spot-the-pain"
  moduleTitle: string;
  form?: string;
  persona?: string;
  attendee?: string;
  transcript?: TranscriptLine[];
  prompt: string;
  choices: QuizChoice[];
  why_best: string;
}

export interface QuizSource {
  title: string;
  note?: string;
  url: string;
}

export interface QuizLeader {
  id: string;
  name: string;
  title: string;
  portrait: string; // filename in content/leaders/ (dev) or KV key suffix (deployed)
}

export type Grade = "A" | "B" | "C" | "D" | "F";

export interface QuizBank {
  version: string; // content hash, for traceability
  gateVersion: number; // bump to require everyone to re-pass
  questionsPerAttempt: number;
  passPercent: number;
  questions: QuizQuestion[];
  sources: QuizSource[];
  leaders: QuizLeader[];
  gradeLines: Record<Grade, string>;
  faqMarkdown?: string;
}

/** A question as the client sees it: no correct flag, no explanations, server-shuffled choices. */
export interface ClientQuestion {
  index: number;
  moduleTitle: string;
  persona?: string;
  attendee?: string;
  transcript?: TranscriptLine[];
  prompt: string;
  choices: string[];
}

export interface AttemptItem {
  qid: string;
  order: number[]; // order[displayPos] = index into question.choices
  answeredPos?: number;
  correct?: boolean;
}

export interface QuizAttempt {
  id: string;
  token: string;
  traineeKey: string;
  bankVersion: string;
  gateVersion: number;
  leaderId: string;
  items: AttemptItem[];
  createdAt: string;
  completedAt?: string;
}

export interface QuizPass {
  grade: Grade;
  percent: number;
  right: number;
  total: number;
  gateVersion: number;
  bankVersion: string;
  passedAt: string;
}

export interface QuizResult {
  right: number;
  total: number;
  percent: number;
  grade: Grade;
  passed: boolean;
  leader: { id: string; name: string; title: string; line: string };
  missed: Array<{ moduleTitle: string; summary: string }>;
}
