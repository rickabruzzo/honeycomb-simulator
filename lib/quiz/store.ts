/**
 * Quiz links, attempts, passes and results. The quiz is its own thing: an admin sends a trainee a
 * personal quiz link (separate from practice links), and passing it unlocks the simulator for that
 * trainee. KV in deployed environments; the globalThis memory store in local dev (module-local
 * Maps would diverge across Turbopack route instances — see lib/memoryStore.ts).
 */
import { kv } from "@vercel/kv";
import { randomUUID } from "crypto";
import { useKv as kvEnabled } from "../kvConfig";
import { getMemStore } from "../memoryStore";
import { getInvite } from "../invites";
import { getTrainee } from "../traineeStore";
import { uniqueToken } from "../readableToken";
import { buildItems, computeResult, correctPos, drawQuestions, partialPos, toClientQuestion } from "./logic";
import type {
  AttemptSummary,
  ClientQuestion,
  QuizAttempt,
  QuizBank,
  QuizLink,
  QuizPass,
  QuizRecord,
  QuizResult,
} from "./types";

const ATTEMPT_TTL_SECONDS = 60 * 60 * 24;
const MAX_ATTEMPTS_KEPT = 50;

const attemptKey = (id: string) => `quiz_attempt:${id}`;
const passKey = (traineeKey: string) => `quiz_pass:${traineeKey}`;
const lastSeenKey = (traineeKey: string) => `quiz_last_seen:${traineeKey}`;
const linkKey = (token: string) => `quizlink:${token}`;
const linkByTraineeKey = (traineeId: string) => `quizlink_trainee:${traineeId}`;
const recordKey = (traineeId: string) => `quiz_results:trainee:${traineeId}`;
const INDEX_KEY = "quiz_results:index"; // trainee ids, newest first

const traineeKeyFor = (traineeId: string) => `trainee:${traineeId}`;

async function get<T>(key: string): Promise<T | null> {
  if (kvEnabled()) return (await kv.get<T>(key)) ?? null;
  return (getMemStore().quiz.get(key) as T | undefined) ?? null;
}

async function set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  if (kvEnabled()) {
    if (ttlSeconds) await kv.set(key, value, { ex: ttlSeconds });
    else await kv.set(key, value);
    return;
  }
  getMemStore().quiz.set(key, value);
}

async function del(...keys: string[]): Promise<void> {
  if (kvEnabled()) {
    if (keys.length) await kv.del(...keys);
    return;
  }
  for (const k of keys) getMemStore().quiz.delete(k);
}

async function addToIndex(traineeId: string): Promise<void> {
  const ids = (await get<string[]>(INDEX_KEY)) ?? [];
  if (ids.includes(traineeId)) return;
  await set(INDEX_KEY, [traineeId, ...ids].slice(0, 1000));
}

// ── Quiz links ──────────────────────────────────────────────────────────────

export async function getQuizLink(token: string): Promise<QuizLink | null> {
  return get<QuizLink>(linkKey(token));
}

/** One quiz link per trainee: returns the existing link, or creates it. */
export async function getOrCreateQuizLink(traineeId: string): Promise<QuizLink | null> {
  const existing = await get<string>(linkByTraineeKey(traineeId));
  if (existing) {
    const link = await getQuizLink(existing);
    if (link) return link;
  }
  const trainee = await getTrainee(traineeId);
  if (!trainee) return null;
  const traineeName = `${trainee.firstName} ${trainee.lastName}`.trim();
  const link: QuizLink = {
    // Readable: /q/rick-abruzzo-x7k2. Older UUID links still resolve (lookup is by key).
    token: await uniqueToken(traineeName, async (t) => Boolean(await getQuizLink(t))),
    traineeId,
    traineeName,
    createdAt: new Date().toISOString(),
  };
  await set(linkKey(link.token), link);
  await set(linkByTraineeKey(traineeId), link.token);
  if (!(await get<QuizRecord>(recordKey(traineeId)))) {
    const record: QuizRecord = {
      traineeId,
      traineeName: link.traineeName,
      quizToken: link.token,
      attempts: [],
    };
    await set(recordKey(traineeId), record);
  }
  await addToIndex(traineeId);
  return link;
}

/** Remove a trainee's quiz link and all their quiz results (including the pass). */
export async function deleteQuizTrainee(traineeId: string): Promise<boolean> {
  const token = await get<string>(linkByTraineeKey(traineeId));
  const ids = (await get<string[]>(INDEX_KEY)) ?? [];
  const tk = traineeKeyFor(traineeId);
  await del(
    ...(token ? [linkKey(token)] : []),
    linkByTraineeKey(traineeId),
    recordKey(traineeId),
    passKey(tk),
    lastSeenKey(tk)
  );
  if (ids.includes(traineeId)) await set(INDEX_KEY, ids.filter((id) => id !== traineeId));
  return Boolean(token) || ids.includes(traineeId);
}

export async function listQuizRecords(
  bank: QuizBank | null
): Promise<Array<QuizRecord & { passed: boolean }>> {
  const ids = (await get<string[]>(INDEX_KEY)) ?? [];
  if (!ids.length) return [];
  const records: Array<QuizRecord | null> = kvEnabled()
    ? await kv.mget<(QuizRecord | null)[]>(...ids.map(recordKey))
    : await Promise.all(ids.map((id) => get<QuizRecord>(recordKey(id))));
  const out: Array<QuizRecord & { passed: boolean }> = [];
  for (const r of records) {
    if (!r) continue;
    const passed = bank ? await traineePassed(r.traineeId, bank) : false;
    out.push({ ...r, passed });
  }
  return out;
}

// ── Attempts ────────────────────────────────────────────────────────────────

export async function getPass(traineeKey: string, bank: QuizBank): Promise<QuizPass | null> {
  const pass = await get<QuizPass>(passKey(traineeKey));
  return pass && pass.gateVersion >= bank.gateVersion ? pass : null;
}

export async function traineePassed(traineeId: string, bank: QuizBank): Promise<boolean> {
  return Boolean(await getPass(traineeKeyFor(traineeId), bank));
}

export async function startAttempt(
  link: QuizLink,
  bank: QuizBank
): Promise<{ attemptId: string; questions: ClientQuestion[] }> {
  const traineeKey = traineeKeyFor(link.traineeId);
  const lastSeen = (await get<string[]>(lastSeenKey(traineeKey))) ?? [];
  const drawn = drawQuestions(bank.questions, bank.questionsPerAttempt, new Set(lastSeen));
  const items = buildItems(drawn);
  const leaders = bank.leaders;
  const attempt: QuizAttempt = {
    id: randomUUID(),
    token: link.token,
    traineeKey,
    bankVersion: bank.version,
    gateVersion: bank.gateVersion,
    leaderId: leaders.length ? leaders[Math.floor(Math.random() * leaders.length)].id : "",
    items,
    createdAt: new Date().toISOString(),
  };
  await set(attemptKey(attempt.id), attempt, ATTEMPT_TTL_SECONDS);
  await set(lastSeenKey(traineeKey), drawn.map((q) => q.id));
  return {
    attemptId: attempt.id,
    questions: drawn.map((q, i) => toClientQuestion(q, items[i], i)),
  };
}

export type AnswerOutcome =
  | { error: "not_found" | "bad_request" | "bank_changed" }
  | {
      correct: boolean;
      /** The pick was the question's acceptable-but-not-best choice (half a point). */
      partial: boolean;
      correctPos: number;
      whyNot: string | null;
      whyBest: string;
      result: QuizResult | null; // set once the last question is answered
    };

async function recordCompletion(link: QuizLink, attempt: QuizAttempt, result: QuizResult) {
  const summary: AttemptSummary = {
    attemptId: attempt.id,
    grade: result.grade,
    right: result.right,
    partial: result.partial,
    total: result.total,
    percent: result.percent,
    passed: result.passed,
    completedAt: attempt.completedAt!,
    missedModules: result.missed.map((m) => m.moduleTitle),
  };
  const record: QuizRecord = (await get<QuizRecord>(recordKey(link.traineeId))) ?? {
    traineeId: link.traineeId,
    traineeName: link.traineeName,
    quizToken: link.token,
    attempts: [],
  };
  record.attempts = [summary, ...record.attempts].slice(0, MAX_ATTEMPTS_KEPT);
  if (result.passed && !record.passedAt) record.passedAt = summary.completedAt;
  await set(recordKey(link.traineeId), record);
  await addToIndex(link.traineeId);

  if (result.passed) {
    const pass: QuizPass = {
      grade: result.grade,
      percent: result.percent,
      right: result.right,
      total: result.total,
      gateVersion: attempt.gateVersion,
      bankVersion: attempt.bankVersion,
      passedAt: summary.completedAt,
    };
    await set(passKey(attempt.traineeKey), pass);
  }
}

/**
 * Record the FIRST answer for a question (re-answers return the original verdict; the score is
 * "right on first try"). Correctness is decided here, never on the client.
 */
export async function answerQuestion(
  link: QuizLink,
  attemptId: string,
  index: number,
  pos: number,
  bank: QuizBank
): Promise<AnswerOutcome> {
  const attempt = await get<QuizAttempt>(attemptKey(attemptId));
  if (!attempt || attempt.token !== link.token) return { error: "not_found" };
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
    // The acceptable-but-not-best choice, when the question has one: half a point.
    const okay = partialPos(q, item);
    item.partial = !item.correct && okay >= 0 && pos === okay;
  }
  const picked = q.choices[item.order[item.answeredPos]];

  let result: QuizResult | null = null;
  if (attempt.items.every((it) => it.answeredPos !== undefined)) {
    result = computeResult(attempt, bank);
    if (!attempt.completedAt) {
      attempt.completedAt = new Date().toISOString();
      await recordCompletion(link, attempt, result);
    }
  }
  await set(attemptKey(attempt.id), attempt, ATTEMPT_TTL_SECONDS);

  return {
    correct: item.correct === true,
    partial: item.partial === true,
    correctPos: right,
    whyNot: item.correct ? null : picked.why_not ?? null,
    whyBest: q.why_best,
    result,
  };
}

// ── Simulator gate ──────────────────────────────────────────────────────────

/** The trainee a practice-link (invite) token belongs to, if any. */
export async function traineeIdForInvite(inviteToken: string): Promise<string | null> {
  const invite = await getInvite(inviteToken);
  if (!invite || invite.revoked) return null;
  return invite.traineeId ?? null;
}

/**
 * Server-side gate used by the message route: true when this session may start the simulator.
 * Prefers the trainee recorded on the session; falls back to the invite. Sessions with no
 * trainee (admin/dev paths) aren't gated.
 */
export async function quizAllowsSession(
  who: { traineeId?: string | null; token?: string | null },
  bank: QuizBank
): Promise<boolean> {
  const traineeId = who.traineeId ?? (who.token ? await traineeIdForInvite(who.token) : null);
  if (!traineeId) return true;
  return traineePassed(traineeId, bank);
}
