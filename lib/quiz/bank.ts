/**
 * Quiz bank access. Deployed environments read the bank (and leader portraits) from KV, seeded by
 * scripts/seed-quiz.ts; local dev reads the gitignored content/ folder on every call so edits show
 * up without a restart.
 */
import { kv } from "@vercel/kv";
import { useKv as kvEnabled } from "../kvConfig";
import { loadBankFromDisk, loadPortraitFromDisk } from "./disk";
import type { QuizBank } from "./types";

export const BANK_KEY = "quiz:bank";
export const portraitKey = (leaderId: string) => `quiz:portrait:${leaderId}`;

const CACHE_MS = 60_000;
let cached: { bank: QuizBank | null; at: number } | null = null;

export async function getQuizBank(): Promise<QuizBank | null> {
  if (!kvEnabled()) return loadBankFromDisk();
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.bank;
  const bank = (await kv.get<QuizBank>(BANK_KEY)) ?? null;
  cached = { bank, at: Date.now() };
  return bank;
}

/** The quiz gates the simulator only when a usable bank exists and it hasn't been switched off. */
export function isQuizUsable(bank: QuizBank | null): bank is QuizBank {
  if (process.env.QUIZ_GATE === "off") return false;
  return Boolean(bank && bank.questions.length >= bank.questionsPerAttempt);
}

export async function getLeaderPortrait(leaderId: string): Promise<Buffer | null> {
  if (kvEnabled()) {
    const b64 = await kv.get<string>(portraitKey(leaderId));
    return b64 ? Buffer.from(b64, "base64") : null;
  }
  const bank = loadBankFromDisk();
  const leader = bank?.leaders.find((l) => l.id === leaderId);
  return leader ? loadPortraitFromDisk(leader.portrait) : null;
}
