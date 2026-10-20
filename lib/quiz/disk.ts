/**
 * Build the quiz bank from the gitignored content/ folder. Used directly in local dev and by
 * scripts/seed-quiz.ts to push the bank to KV. Returns null when the folder isn't there (it is
 * never deployed), so deployed environments fall through to KV.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import YAML from "yaml";
import type { Grade, QuizBank, QuizLeader, QuizQuestion, QuizSource } from "./types";

const CONTENT_DIR = path.join(process.cwd(), "content");
const GUIDE_DIR = path.join(CONTENT_DIR, "study-guide");
const MODULES_DIR = path.join(GUIDE_DIR, "modules");
export const LEADERS_DIR = path.join(CONTENT_DIR, "leaders");

interface RawQuestion extends Omit<QuizQuestion, "module" | "moduleTitle"> {
  hold?: boolean;
  verify?: boolean;
}

interface RawSettings {
  gate_version?: number;
  questions_per_attempt?: number;
  pass_percent?: number;
  sources?: QuizSource[];
  leaders?: QuizLeader[];
  grade_lines?: Record<Grade, string>;
}

export function loadBankFromDisk(): QuizBank | null {
  if (!fs.existsSync(MODULES_DIR)) return null;

  const settingsPath = path.join(GUIDE_DIR, "quiz.yaml");
  const settings: RawSettings = fs.existsSync(settingsPath)
    ? YAML.parse(fs.readFileSync(settingsPath, "utf8")) ?? {}
    : {};

  const questions: QuizQuestion[] = [];
  for (const file of fs.readdirSync(MODULES_DIR).filter((f) => f.endsWith(".yaml")).sort()) {
    const doc = YAML.parse(fs.readFileSync(path.join(MODULES_DIR, file), "utf8"));
    for (const q of (doc?.questions ?? []) as RawQuestion[]) {
      // Held questions are waiting on an SME answer; keep them out of every attempt.
      if (q.hold) continue;
      questions.push({
        id: q.id,
        module: doc.module,
        moduleTitle: doc.title,
        form: q.form,
        persona: q.persona,
        attendee: q.attendee,
        transcript: q.transcript,
        prompt: q.prompt,
        choices: q.choices,
        why_best: q.why_best,
      });
    }
  }

  const faqPath = path.join(GUIDE_DIR, "sources", "booth-faq.md");
  const faqMarkdown = fs.existsSync(faqPath) ? fs.readFileSync(faqPath, "utf8") : undefined;

  const body = {
    gateVersion: settings.gate_version ?? 1,
    questionsPerAttempt: settings.questions_per_attempt ?? 15,
    passPercent: settings.pass_percent ?? 65,
    questions,
    sources: settings.sources ?? [],
    leaders: settings.leaders ?? [],
    gradeLines: settings.grade_lines ?? ({} as Record<Grade, string>),
    faqMarkdown,
  };
  const version = createHash("sha1").update(JSON.stringify(body)).digest("hex").slice(0, 12);
  return { version, ...body };
}

export function loadPortraitFromDisk(file: string): Buffer | null {
  const p = path.join(LEADERS_DIR, path.basename(file));
  return fs.existsSync(p) ? fs.readFileSync(p) : null;
}
