import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMemStore } from "./memoryStore";
import { getOrCreateQuizLink } from "./quiz/store";
import { findTraineeByEmail, upsertTrainee } from "./traineeStore";

vi.mock("@/lib/quiz/bank", () => ({
  getQuizBank: async () => ({ gateVersion: 1, questionsPerAttempt: 1, questions: [{}], passPercent: 65, sources: [] }),
  isQuizUsable: () => true,
}));
const session = vi.hoisted(() => ({ current: null as null | { user: { email: string } } }));
vi.mock("@/auth", () => ({ auth: async () => session.current }));

import { GET } from "../app/api/quiz/[token]/route";

const get = (token: string) =>
  GET(new Request(`http://localhost/api/quiz/${token}`), { params: Promise.resolve({ token }) });

beforeEach(() => {
  const mem = getMemStore();
  mem.trainees.clear();
  mem.traineeIndex.length = 0;
  mem.quiz.clear();
  session.current = null;
});
afterEach(() => {
  delete process.env.ADMIN_EMAILS;
});

describe("personal quiz links belong to their trainee", () => {
  it("opens for the trainee it was made for", async () => {
    const t = await upsertTrainee({ firstName: "Rick", lastName: "Abruzzo", email: "rick@honeycomb.io" });
    const link = (await getOrCreateQuizLink(t.id))!;
    session.current = { user: { email: "rick@honeycomb.io" } };
    expect((await get(link.token)).status).toBe(200);
  });

  it("refuses another signed-in trainee and says whose link it is", async () => {
    const t = await upsertTrainee({ firstName: "Rick", lastName: "Abruzzo", email: "rick@honeycomb.io" });
    const link = (await getOrCreateQuizLink(t.id))!;
    session.current = { user: { email: "maggie@honeycomb.io" } };
    const res = await get(link.token);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "wrong_person", traineeName: "Rick Abruzzo" });
  });

  it("lets a listed admin open anyone's link", async () => {
    process.env.ADMIN_EMAILS = "maggie@honeycomb.io";
    const t = await upsertTrainee({ firstName: "Rick", lastName: "Abruzzo", email: "rick@honeycomb.io" });
    const link = (await getOrCreateQuizLink(t.id))!;
    session.current = { user: { email: "maggie@honeycomb.io" } };
    expect((await get(link.token)).status).toBe(200);
  });

  it("attaches the signed-in email to a legacy record with none, then treats it as theirs", async () => {
    process.env.ADMIN_EMAILS = "someone-else@honeycomb.io"; // so Ken isn't an admin by default
    const t = await upsertTrainee({ firstName: "Ken", lastName: "Rimple" });
    const link = (await getOrCreateQuizLink(t.id))!;
    session.current = { user: { email: "ken@honeycomb.io" } };
    expect((await get(link.token)).status).toBe(200);
    expect((await findTraineeByEmail("ken@honeycomb.io"))?.id).toBe(t.id);
    session.current = { user: { email: "maggie@honeycomb.io" } };
    expect((await get(link.token)).status).toBe(403);
  });
});
