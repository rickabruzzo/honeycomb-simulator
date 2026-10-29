import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/kv", async () => ({ kv: (await import("./testing/fakeKv")).fakeKv }));

import { getMemStore } from "./memoryStore";
import { enableFakeKvEnv, fakeKv } from "./testing/fakeKv";
import {
  archiveTrainee,
  findTraineeByEmail,
  findTraineeByName,
  listTrainees,
  markTraineePracticed,
  normalizeEmail,
  upsertTrainee,
} from "./traineeStore";

// vitest has no KV env, so the store runs on the in-memory globalThis store (except where a
// describe block switches on the fake KV client).
beforeEach(() => {
  const mem = getMemStore();
  mem.trainees.clear();
  mem.traineeIndex.length = 0;
});

describe("trainee email", () => {
  it("stores the email trimmed and lowercased", async () => {
    const t = await upsertTrainee({
      firstName: "Quiz",
      lastName: "Tester",
      email: " Quiz.Tester@Example.com ",
    });
    expect(t.email).toBe("quiz.tester@example.com");
  });

  it("keeps the stored email when an upsert by name passes none", async () => {
    await upsertTrainee({ firstName: "Quiz", lastName: "Tester", email: "qt@example.com" });
    const again = await upsertTrainee({ firstName: "Quiz", lastName: "Tester" });
    expect(again.email).toBe("qt@example.com");
  });

  it("finds a trainee by name regardless of case and spacing", async () => {
    const t = await upsertTrainee({ firstName: "Quiz", lastName: "Tester" });
    const found = await findTraineeByName("quiz ", "  TESTER");
    expect(found?.id).toBe(t.id);
    expect(await findTraineeByName("Nobody", "Here")).toBeNull();
  });

  it("finds a trainee by email regardless of case", async () => {
    const t = await upsertTrainee({ firstName: "Quiz", lastName: "Tester", email: "qt@example.com" });
    const found = await findTraineeByEmail("QT@Example.com");
    expect(found?.id).toBe(t.id);
    expect(await findTraineeByEmail("missing@example.com")).toBeNull();
  });

  it("records the first practice once and keeps it through later upserts", async () => {
    const t = await upsertTrainee({ firstName: "Quiz", lastName: "Tester" });
    expect(t.firstPracticeAt).toBeUndefined();
    await markTraineePracticed(t.id);
    const first = (await findTraineeByName("Quiz", "Tester"))!.firstPracticeAt;
    expect(first).toMatch(/^\d{4}-/);
    await new Promise((r) => setTimeout(r, 5));
    await markTraineePracticed(t.id); // a second session must not move the date
    const again = await upsertTrainee({ firstName: "Quiz", lastName: "Tester" }); // by-name upsert keeps it
    expect(again.firstPracticeAt).toBe(first);
  });

  it("rejects malformed emails", () => {
    expect(normalizeEmail("nope")).toBeNull();
    expect(normalizeEmail("a@b")).toBeNull();
    expect(normalizeEmail("  A@B.co ")).toBe("a@b.co");
  });
});

describe("trainees index, KV mode", () => {
  const T0 = new Date("2026-10-28T12:00:00.000Z").getTime();
  beforeEach(() => {
    fakeKv.reset();
    enableFakeKvEnv();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("creating a trainee writes the record, then indexes it in one atomic ZADD + trim", async () => {
    const t = await upsertTrainee({ firstName: "Quiz", lastName: "Tester" });

    expect(fakeKv.commandsOf("set").map((c) => c.args[0])).toEqual([`trainee:${t.id}`]);
    const multis = fakeKv.calls.filter((c) => c.op === "multi");
    expect(multis).toHaveLength(1);
    expect(multis[0]).toEqual({
      op: "multi",
      commands: [
        { op: "zadd", args: ["trainees:index:v2", { score: T0, member: t.id }] },
        { op: "zremrangebyrank", args: ["trainees:index:v2", 0, -501] },
      ],
    });
    expect(await listTrainees()).toEqual([t]);
  });

  it("lists newest first and hides archived trainees unless asked", async () => {
    const a = await upsertTrainee({ firstName: "Quiz", lastName: "Alpha" });
    vi.setSystemTime(T0 + 1000);
    const b = await upsertTrainee({ firstName: "Quiz", lastName: "Beta" });
    vi.setSystemTime(T0 + 2000);
    const c = await upsertTrainee({ firstName: "Quiz", lastName: "Gamma" });
    expect((await listTrainees()).map((t) => t.id)).toEqual([c.id, b.id, a.id]);

    expect(await archiveTrainee(b.id)).toBe(true);
    expect((await listTrainees()).map((t) => t.id)).toEqual([c.id, a.id]);
    expect((await listTrainees(true)).map((t) => t.id)).toEqual([c.id, b.id, a.id]);
  });

  it("updating an existing trainee leaves the index alone", async () => {
    const t = await upsertTrainee({ firstName: "Quiz", lastName: "Tester" });
    fakeKv.calls = [];
    await upsertTrainee({ id: t.id, firstName: "Quiz", lastName: "Tester", email: "qt@example.com" });
    expect(fakeKv.calls.filter((c) => c.op === "multi")).toEqual([]);
    expect(fakeKv.commandsOf("zadd")).toEqual([]);
    expect((await listTrainees())[0].email).toBe("qt@example.com");
  });

  it("migrates the legacy trainees:index array on first read, keeping its order", async () => {
    const old = (id: string, lastName: string) => ({
      id,
      firstName: "Old",
      lastName,
      createdAt: "2026-10-01T00:00:00.000Z",
      isArchived: false,
    });
    await fakeKv.set("trainee:old-b", old("old-b", "B"));
    await fakeKv.set("trainee:old-a", old("old-a", "A"));
    await fakeKv.set("trainees:index", ["old-b", "old-a"]); // newest first, as the old code wrote it

    expect((await listTrainees()).map((t) => t.id)).toEqual(["old-b", "old-a"]);
    expect(await fakeKv.get("trainees:index")).toBeNull();
    expect(fakeKv.zsetMembers("trainees:index:v2")).toEqual(["old-b", "old-a"]);

    const t = await upsertTrainee({ firstName: "New", lastName: "Person" });
    expect((await listTrainees()).map((t) => t.id)).toEqual([t.id, "old-b", "old-a"]);
    // By-name dedupe still finds the migrated trainee.
    expect((await findTraineeByName("old", "a"))?.id).toBe("old-a");
  });
});
