import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMemStore } from "./memoryStore";
import { listTrainees, upsertTrainee } from "./traineeStore";

// after() throws outside a request scope; the route never awaits it, so a no-op is faithful.
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
// A usable bank so the quiz gates (vitest has no KV and CI has no content/ folder).
vi.mock("@/lib/quiz/bank", () => ({
  getQuizBank: async () => ({ gateVersion: 1, questionsPerAttempt: 1, questions: [{}], passPercent: 65 }),
  isQuizUsable: () => true,
}));

import { POST } from "../app/api/start/route";
import { GET as listForPicker } from "../app/api/start/trainees/route";

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/start", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  const mem = getMemStore();
  mem.trainees.clear();
  mem.traineeIndex.length = 0;
  mem.invites.clear();
  mem.inviteIndex.clear();
  mem.inviteOrder = [];
  mem.sessions.clear();
  mem.quiz.clear();
});

describe("POST /api/start", () => {
  it("adds a new person and sends them to the quiz with their practice link attached", async () => {
    const res = await post({ firstName: "QA", lastName: "Quiztest", email: "QA@example.com" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.passed).toBe(false);
    expect(body.traineeName).toBe("QA Quiztest");
    expect(body.next).toMatch(/^\/q\/qa-quiztest-[a-z0-9]{4}\?from=qa-quiztest-[a-z0-9]{4}$/);
    const [t] = await listTrainees();
    expect(t.email).toBe("qa@example.com");
  });

  it("requires a valid email when adding yourself", async () => {
    expect((await post({ firstName: "QA", lastName: "Quiztest" })).status).toBe(400);
    expect((await post({ firstName: "QA", lastName: "Quiztest", email: "nope" })).status).toBe(400);
    expect(await listTrainees()).toHaveLength(0);
  });

  it("points a duplicate name or email at the existing entry instead of creating one", async () => {
    const t = await upsertTrainee({ firstName: "QA", lastName: "Quiztest", email: "qa@example.com" });
    const byName = await post({ firstName: "qa", lastName: "QUIZTEST", email: "other@example.com" });
    expect(byName.status).toBe(409);
    expect(await byName.json()).toMatchObject({ code: "exists", trainee: { id: t.id, firstName: "QA", lastName: "Quiztest" } });
    const byEmail = await post({ firstName: "Someone", lastName: "Else", email: "QA@example.com" });
    expect(byEmail.status).toBe(409);
    expect(await listTrainees()).toHaveLength(1);
  });

  it("resumes the same unfinished session on a second visit", async () => {
    const t = await upsertTrainee({ firstName: "QA", lastName: "Quiztest" });
    const first = await (await post({ traineeId: t.id })).json();
    const second = await (await post({ traineeId: t.id })).json();
    expect(first.next).toBe(second.next);
    expect(getMemStore().invites.size).toBe(1);
  });

  it("skips the quiz once the trainee has passed", async () => {
    const t = await upsertTrainee({ firstName: "QA", lastName: "Quiztest" });
    getMemStore().quiz.set(`quiz_pass:trainee:${t.id}`, { gateVersion: 1, grade: "C", percent: 70, right: 7, total: 10, bankVersion: "x", passedAt: "2026-10-27T00:00:00Z" });
    const body = await (await post({ traineeId: t.id })).json();
    expect(body.passed).toBe(true);
    expect(body.next).toMatch(/^\/s\/qa-quiztest-[a-z0-9]{4}$/);
  });

  it("404s an unknown traineeId", async () => {
    expect((await post({ traineeId: "ghost-xyz1" })).status).toBe(404);
  });
});

describe("GET /api/start/trainees", () => {
  it("lists names only, sorted by last name, never emails", async () => {
    await upsertTrainee({ firstName: "Zed", lastName: "Alpha", email: "z@example.com" });
    await upsertTrainee({ firstName: "Amy", lastName: "Zulu", email: "a@example.com" });
    const body = await (await listForPicker()).json();
    expect(body.trainees.map((t: { lastName: string }) => t.lastName)).toEqual(["Alpha", "Zulu"]);
    expect(JSON.stringify(body)).not.toContain("@");
  });
});
