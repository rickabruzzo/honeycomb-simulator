import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/kv", async () => ({ kv: (await import("./testing/fakeKv")).fakeKv }));

import {
  addInviteToIndex,
  clearInviteIndex,
  listInvitesFromIndex,
  removeInviteFromIndex,
} from "./inviteIndex";
import { getMemStore } from "./memoryStore";
import { enableFakeKvEnv, fakeKv } from "./testing/fakeKv";

describe("invite index, memory mode", () => {
  beforeEach(() => {
    getMemStore().inviteOrder = [];
  });

  it("adds newest first, lists with a limit, removes", async () => {
    await addInviteToIndex("old", "2026-10-28T10:00:00.000Z");
    await addInviteToIndex("new", "2026-10-28T11:00:00.000Z");
    expect(await listInvitesFromIndex()).toEqual(["new", "old"]);
    expect(await listInvitesFromIndex(1)).toEqual(["new"]);
    expect(await removeInviteFromIndex("old")).toBe(true);
    expect(await removeInviteFromIndex("old")).toBe(false);
    expect(await listInvitesFromIndex()).toEqual(["new"]);
    await clearInviteIndex();
    expect(await listInvitesFromIndex()).toEqual([]);
  });
});

describe("invite index, KV mode", () => {
  beforeEach(() => {
    fakeKv.reset();
    enableFakeKvEnv();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("adds in one MULTI scored by createdAt and lists newest first", async () => {
    await addInviteToIndex("tok-old", "2026-10-28T10:00:00.000Z");
    await addInviteToIndex("tok-new", "2026-10-28T11:00:00.000Z");

    expect(fakeKv.calls.filter((c) => c.op === "multi")).toHaveLength(2);
    expect(fakeKv.commandsOf("zadd")[0].args).toEqual([
      "invites:index:v2",
      { score: Date.parse("2026-10-28T10:00:00.000Z"), member: "tok-old" },
    ]);
    // The index keeps 500 rows (raised from 100 for the self-serve link), so trim everything below rank -500.
    expect(fakeKv.commandsOf("zremrangebyrank")[0].args).toEqual(["invites:index:v2", 0, -501]);
    // Never the old read-modify-write of the JSON array.
    expect(fakeKv.commandsOf("get")).toEqual([]);
    expect(fakeKv.commandsOf("set")).toEqual([]);

    expect(await listInvitesFromIndex()).toEqual(["tok-new", "tok-old"]);
    expect(await listInvitesFromIndex(1)).toEqual(["tok-new"]);
  });

  it("falls back to now when createdAt doesn't parse", async () => {
    const before = Date.now();
    await addInviteToIndex("tok", "not-a-date");
    const { score } = fakeKv.commandsOf("zadd")[0].args[1] as { score: number };
    expect(score).toBeGreaterThanOrEqual(before);
    expect(score).toBeLessThanOrEqual(Date.now());
  });

  it("removes with a single ZREM and reports whether the token was indexed", async () => {
    await addInviteToIndex("tok", "2026-10-28T10:00:00.000Z");
    fakeKv.calls = [];
    expect(await removeInviteFromIndex("tok")).toBe(true);
    expect(await removeInviteFromIndex("tok")).toBe(false);
    expect(fakeKv.commandsOf("zrem")).toEqual([
      { op: "zrem", args: ["invites:index:v2", "tok"] },
      { op: "zrem", args: ["invites:index:v2", "tok"] },
    ]);
    expect(fakeKv.commandsOf("set")).toEqual([]);
    expect(await listInvitesFromIndex()).toEqual([]);
  });

  it("migrates the legacy {token, createdAt} array on first read, keeping its order", async () => {
    await fakeKv.set("invites:index", [
      { token: "b", createdAt: "2026-10-27T11:00:00.000Z" },
      { token: "a", createdAt: "2026-10-27T10:00:00.000Z" },
    ]);
    expect(await listInvitesFromIndex()).toEqual(["b", "a"]);
    expect(await fakeKv.get("invites:index")).toBeNull();

    await addInviteToIndex("c", new Date().toISOString());
    expect(await listInvitesFromIndex()).toEqual(["c", "b", "a"]);
    expect(await removeInviteFromIndex("a")).toBe(true);
    expect(await listInvitesFromIndex()).toEqual(["c", "b"]);
  });

  it("clearInviteIndex deletes the sorted set and any legacy array", async () => {
    await fakeKv.set("invites:index", [{ token: "a", createdAt: "2026-10-27T10:00:00.000Z" }]);
    await addInviteToIndex("b", "2026-10-28T10:00:00.000Z");
    await clearInviteIndex();
    expect(fakeKv.calls.at(-1)).toEqual({ op: "del", args: ["invites:index:v2", "invites:index"] });
    expect(await listInvitesFromIndex()).toEqual([]);
  });
});
