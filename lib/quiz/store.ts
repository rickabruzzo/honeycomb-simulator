/**
 * Quiz attempts and passes. KV in deployed environments; the globalThis memory store in local dev
 * (module-local Maps would diverge across Turbopack route instances — see lib/memoryStore.ts).
 */
import { kv } from "@vercel/kv";
import { randomUUID } from "crypto";
import { useKv as kvEnabled } from "../kvConfig";
import { getMemStore } from "../memoryStore";
import { getInvite } from "../invites";
import { buildItems, computeResult, correctPos, drawQuestions, toClientQuestion } from "./logic";
import type { ClientQuestion, QuizAttempt, QuizBank, QuizPass, QuizResult } from "./types";

const ATTEMPT_TTL_SECONDS = 60 * 60 * 24;

const attemptKey = (id: string) => `quiz_attempt:${id}`;
const passKey = (traineeKey: string) => `quiz_pass:${traineeKey}`;
const lastSeenKey = (traineeKey: string) => `quiz_last_seen:${traineeKey}`;

/**
 * A pass belongs to the trainee when the invite names one (so a second practice link doesn't
 * make them re-quiz), otherwise to the invite itself.
 */
export async function traineeKeyForToken(token: string): Promise<string | null> {
  const invite = await getInvite(token);
  if (!invite || invite.revoked) return null;
  return invite.traineeId ? `trainee:${invite.traineeId}` : `invite:${token}`;
}

async function kvOrMemGet<T>(key: string): Promise<T | null> {
  if (kvEnabled()) return (await kv.get<T>(key)) ?? null;
  return (getMemStore().quiz.get(key) as T | undefined) ?? null;
}

async function kvOrMemSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  if (kvEnabled()) {
    if (ttlSeconds) await kv.set(key, value, { ex: ttlSeconds });
    else await kv.set(key, value);
    return;
  }
  getMemStore().quiz.set(key, value);
}

export async function getPass(traineeKey: string, bank: QuizBank): Promise<QuizPass | null> {
  const pass = await kvOrMemGet<QuizPass>(passKey(traineeKey));
  return pass && pass.gateVersion >= bank.gateVersion ? pass : null;
}

export async function startAttempt(
  token: string,
  traineeKey: string,
  bank: QuizBank
): Promise<{ attemptId: string; questions: ClientQuestion[] }> {
  const lastSeen = (await kvOrMemGet<string[]>(lastSeenKey(traineeKey))) ?? [];
  const drawn = drawQuestions(bank.questions, bank.questionsPerAttempt, new Set(lastSeen));
  const items = buildItems(drawn);
  const leaders = bank.leaders;
  const attempt: QuizAttempt = {
    id: randomUUID(),
    token,
    traineeKey,
    bankVersion: bank.version,
    gateVersion: bank.gateVersion,
    leaderId: leaders.length ? leaders[Math.floor(Math.random() * leaders.length)].id : "",
    items,
    createdAt: new Date().toISOString(),
  };
  await kvOrMemSet(attemptKey(attempt.id), attempt, ATTEMPT_TTL_SECONDS);
  await kvOrMemSet(lastSeenKey(traineeKey), drawn.map((q) => q.id));
  return {
    attemptId: attempt.id,
    questions: drawn.map((q, i) => toClientQuestion(q, items[i], i)),
  };
}

export type AnswerOutcome =
  | { error: "not_found" | "bad_request" | "bank_changed" }
  | {
      correct: boolean;
      correctPos: number;
      whyNot: string | null;
      whyBest: string;
      result: QuizResult | null; // set once the last question is answered
    };

/**
 * Record the FIRST answer for a question (re-answers return the original verdict; the score is
 * "right on first try"). Correctness is decided here, never on the client.
 */
export async function answerQuestion(
  token: string,
  attemptId: string,
  index: number,
  pos: number,
  bank: QuizBank
): Promise<AnswerOutcome> {
  const attempt = await kvOrMemGet<QuizAttempt>(attemptKey(attemptId));
  if (!attempt || attempt.token !== token) return { error: "not_found" };
  const item = attempt.items[index];
  if (!item || !Number.isInteger(pos) || pos < 0 || pos >= item.order.length) {
    return { error: "bad_request" };
  }
  const q = bank.questions.find((x) => x.id === item.qid);
  if (!q) return { error: "bank_changed" };

  const right = correctPos(q, item);
  if (item.answeredPos === undefined) {
    item.answeredPos = pos;
    item.correct = pos === right;
  }
  const picked = q.choices[item.order[item.answeredPos]];

  let result: QuizResult | null = null;
  if (attempt.items.every((it) => it.answeredPos !== undefined)) {
    result = computeResult(attempt, bank);
    if (!attempt.completedAt) {
      attempt.completedAt = new Date().toISOString();
      if (result.passed) {
        const pass: QuizPass = {
          grade: result.grade,
          percent: result.percent,
          right: result.right,
          total: result.total,
          gateVersion: attempt.gateVersion,
          bankVersion: attempt.bankVersion,
          passedAt: attempt.completedAt,
        };
        await kvOrMemSet(passKey(attempt.traineeKey), pass);
      }
    }
  }
  await kvOrMemSet(attemptKey(attempt.id), attempt, ATTEMPT_TTL_SECONDS);

  return {
    correct: item.correct === true,
    correctPos: right,
    whyNot: item.correct ? null : picked.why_not ?? null,
    whyBest: q.why_best,
    result,
  };
}

/** Server-side gate used by the message route: true when this invite may start the simulator. */
export async function quizAllowsSession(token: string | null, bank: QuizBank): Promise<boolean> {
  if (!token) return true; // sessions without an invite (admin/dev paths) aren't gated
  const traineeKey = await traineeKeyForToken(token);
  if (!traineeKey) return true;
  return Boolean(await getPass(traineeKey, bank));
}
