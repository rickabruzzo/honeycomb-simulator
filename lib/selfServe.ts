import { kv } from "@vercel/kv";
import { useKv as kvEnabled } from "./kvConfig";
import { getMemStore } from "./memoryStore";

/**
 * The generic self-serve link (/start): a person picks or adds themselves, then follows the same
 * order as everyone else, quiz first and the simulator after a pass. Their practice session is
 * created up front (random persona) so the quiz can hand them straight into it, and remembered
 * per trainee so a returning visitor resumes an unfinished session instead of piling up new ones.
 */

export type SelfServeStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export interface SelfServeDecision {
  passed: boolean;
  quizToken: string;
  /** The session we remembered for this trainee, if it still exists. */
  existing: { token: string; status: SelfServeStatus } | null;
  /** Creates a new random-persona practice session and returns its invite token. */
  createInvite: () => Promise<string>;
}

/** Reuse an unfinished session; otherwise create one. Then quiz first unless they've passed. */
export async function pickSelfServeNext(
  d: SelfServeDecision
): Promise<{ next: string; inviteToken: string; reused: boolean }> {
  const reused = Boolean(d.existing && d.existing.status !== "COMPLETED");
  const inviteToken = reused ? d.existing!.token : await d.createInvite();
  const next = d.passed ? `/s/${inviteToken}` : `/q/${d.quizToken}?from=${inviteToken}`;
  return { next, inviteToken, reused };
}

// Keyed like the quiz keys and stored alongside them (getMemStore().quiz in dev, KV deployed).
const key = (traineeId: string) => `selfserve:trainee:${traineeId}`;

export async function getSelfServeInvite(traineeId: string): Promise<string | null> {
  if (kvEnabled()) return (await kv.get<{ token: string }>(key(traineeId)))?.token ?? null;
  return (getMemStore().quiz.get(key(traineeId)) as { token: string } | undefined)?.token ?? null;
}

export async function rememberSelfServeInvite(traineeId: string, token: string): Promise<void> {
  if (kvEnabled()) {
    await kv.set(key(traineeId), { token });
    return;
  }
  getMemStore().quiz.set(key(traineeId), { token });
}
