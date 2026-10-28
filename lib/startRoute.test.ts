import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMemStore } from "./memoryStore";
import { listTrainees, markTraineePracticed, upsertTrainee } from "./traineeStore";

// after() throws outside a request scope; the route never awaits it, so a no-op is faithful.
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
// A usable bank so the quiz gates (vitest has no KV and CI has no content/ folder).
vi.mock("@/lib/quiz/bank", () => ({
  getQuizBank: async () => ({ gateVersion: 1, questionsPerAttempt: 1, questions: [{}], passPercent: 65 }),
  isQuizUsable: () => true,
}));
// The signed-in Google user, set per test.
const session = vi.hoisted(() => ({ current: null as null | { user: { email: string; name?: string; givenName?: string; familyName?: string } } }));
vi.mock("@/auth", () => ({ auth: async () => session.current }));

import { POST } from "../app/api/start/route";

const post = () => POST(new Request("http://localhost/api/start", { method: "POST", body: "{}" }));
const signedIn = (email: string, extra: Partial<{ name: string; givenName: string; familyName: string }> = {}) => {
  session.current = { user: { email, ...extra } };
};

beforeEach(() => {
  const mem = getMemStore();
  mem.trainees.clear();
  mem.traineeIndex.length = 0;
  mem.invites.clear();
  mem.inviteIndex.clear();
  mem.inviteOrder = [];
  mem.sessions.clear();
  mem.quiz.clear();
  session.current = null;
});

describe("POST /api/start (signed in with Google)", () => {
  it("401s without a session", async () => {
    expect((await post()).status).toBe(401);
  });

  it("creates the trainee from the Google name and sends them to the quiz with a session attached", async () => {
    signedIn("qa.quiztest@honeycomb.io", { givenName: "QA", familyName: "Quiztest", name: "QA Quiztest" });
    const res = await post();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ passed: false, traineeName: "QA Quiztest" });
    expect(body.next).toMatch(/^\/q\/qa-quiztest-[a-z0-9]{4}\?from=qa-quiztest-[a-z0-9]{4}$/);
    const [t] = await listTrainees();
    expect(t.email).toBe("qa.quiztest@honeycomb.io");
  });

  it("matches an existing trainee by email, never by the Google display name", async () => {
    const t = await upsertTrainee({ firstName: "Rick", lastName: "Abruzzo", email: "rick@honeycomb.io" });
    signedIn("rick@honeycomb.io", { name: "Richard A." });
    const body = await (await post()).json();
    expect(body.traineeName).toBe("Rick Abruzzo");
    expect(body.next).toContain(`/q/rick-abruzzo-`);
    expect(await listTrainees()).toHaveLength(1);
    expect(getMemStore().invites.values().next().value?.traineeId).toBe(t.id);
  });

  it("resumes the same unfinished session on a second visit", async () => {
    signedIn("qa.quiztest@honeycomb.io", { givenName: "QA", familyName: "Quiztest" });
    const first = await (await post()).json();
    const second = await (await post()).json();
    expect(first.next).toBe(second.next);
    expect(getMemStore().invites.size).toBe(1);
  });

  it("starts a new session when the remembered one has ended or is gone", async () => {
    signedIn("qa.quiztest@honeycomb.io", { givenName: "QA", familyName: "Quiztest" });
    const first = await (await post()).json();
    const firstInvite = /from=([a-z0-9-]+)$/.exec(first.next)![1];
    const sess = getMemStore().sessions.get(getMemStore().invites.get(firstInvite)!.sessionId)!;
    sess.active = false;
    const second = await (await post()).json();
    expect(second.next).not.toBe(first.next);
    expect(getMemStore().invites.size).toBe(2);
    const secondInvite = /from=([a-z0-9-]+)$/.exec(second.next)![1];
    getMemStore().sessions.delete(getMemStore().invites.get(secondInvite)!.sessionId);
    const third = await (await post()).json();
    expect(third.next).not.toBe(second.next);
    expect(getMemStore().invites.size).toBe(3);
  });

  it("turns training wheels on for a trainee's first session and off once they've practiced", async () => {
    signedIn("qa.quiztest@honeycomb.io", { givenName: "QA", familyName: "Quiztest" });
    const first = await (await post()).json();
    const firstInvite = getMemStore().invites.get(/from=([a-z0-9-]+)$/.exec(first.next)![1])!;
    expect(firstInvite.trainingWheels).toBe(true);
    await markTraineePracticed(firstInvite.traineeId!);
    getMemStore().sessions.get(firstInvite.sessionId)!.active = false;
    const second = await (await post()).json();
    const secondInvite = getMemStore().invites.get(/from=([a-z0-9-]+)$/.exec(second.next)![1])!;
    expect(secondInvite.trainingWheels).toBe(false);
  });

  it("skips the quiz once the trainee has passed", async () => {
    const t = await upsertTrainee({ firstName: "QA", lastName: "Quiztest", email: "qa.quiztest@honeycomb.io" });
    getMemStore().quiz.set(`quiz_pass:trainee:${t.id}`, { gateVersion: 1, grade: "C", percent: 70, right: 7, total: 10, bankVersion: "x", passedAt: "2026-10-27T00:00:00Z" });
    signedIn("qa.quiztest@honeycomb.io");
    const body = await (await post()).json();
    expect(body.passed).toBe(true);
    expect(body.next).toMatch(/^\/s\/qa-quiztest-[a-z0-9]{4}$/);
  });
});
