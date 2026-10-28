import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/kv", async () => ({ kv: (await import("./testing/fakeKv")).fakeKv }));

import { kvIndexAdd, kvIndexClear, kvIndexList, kvIndexRemove, type KvIndex } from "./kvIndex";
import { enableFakeKvEnv, fakeKv } from "./testing/fakeKv";

const index: KvIndex = { key: "things:index:v2", legacyKey: "things:index", cap: 3 };

beforeEach(() => {
  fakeKv.reset();
  enableFakeKvEnv();
});
afterEach(() => vi.unstubAllEnvs());

describe("kvIndexAdd", () => {
  it("is one MULTI of ZADD + trim — no read, no read-modify-write", async () => {
    await kvIndexAdd(index, "a", { score: 100 });
    expect(fakeKv.calls).toEqual([
      {
        op: "multi",
        commands: [
          { op: "zadd", args: ["things:index:v2", { score: 100, member: "a" }] },
          { op: "zremrangebyrank", args: ["things:index:v2", 0, -4] },
        ],
      },
    ]);
    expect(fakeKv.commandsOf("get")).toEqual([]);
    expect(fakeKv.commandsOf("set")).toEqual([]);
  });

  it("lists newest first and trims the oldest past the cap", async () => {
    for (const [m, score] of [
      ["a", 1],
      ["b", 2],
      ["c", 3],
      ["d", 4],
    ] as const) {
      await kvIndexAdd(index, m, { score });
    }
    expect(await kvIndexList(index)).toEqual(["d", "c", "b"]);
  });

  it("re-adding a member moves it to the front; with ifAbsent it keeps its place", async () => {
    await kvIndexAdd(index, "a", { score: 1 });
    await kvIndexAdd(index, "b", { score: 2 });
    await kvIndexAdd(index, "a", { score: 3, ifAbsent: true });
    expect(await kvIndexList(index)).toEqual(["b", "a"]);
    expect(fakeKv.commandsOf("zadd").at(-1)?.args).toEqual([
      "things:index:v2",
      { nx: true },
      { score: 3, member: "a" },
    ]);
    await kvIndexAdd(index, "a", { score: 4 });
    expect(await kvIndexList(index)).toEqual(["a", "b"]);
  });

  it("defaults the score to now", async () => {
    const before = Date.now();
    await kvIndexAdd(index, "a");
    const [{ args }] = fakeKv.commandsOf("zadd");
    const { score } = args[1] as { score: number };
    expect(score).toBeGreaterThanOrEqual(before);
    expect(score).toBeLessThanOrEqual(Date.now());
  });
});

describe("kvIndexRemove", () => {
  it("is a single ZREM and reports whether the member was there", async () => {
    await kvIndexAdd(index, "a", { score: 1 });
    fakeKv.calls = [];
    expect(await kvIndexRemove(index, "a")).toBe(true);
    expect(await kvIndexRemove(index, "a")).toBe(false);
    expect(fakeKv.commandsOf("zrem")).toEqual([
      { op: "zrem", args: ["things:index:v2", "a"] },
      { op: "zrem", args: ["things:index:v2", "a"] },
    ]);
    expect(fakeKv.commandsOf("set")).toEqual([]);
    expect(await kvIndexList(index)).toEqual([]);
  });
});

describe("kvIndexList", () => {
  it("is one pipeline of [GET legacy, ZRANGE … REV] once migrated", async () => {
    await kvIndexAdd(index, "a", { score: 1 });
    fakeKv.calls = [];
    expect(await kvIndexList(index, 10)).toEqual(["a"]);
    expect(fakeKv.calls).toEqual([
      {
        op: "pipeline",
        commands: [
          { op: "get", args: ["things:index"] },
          { op: "zrange", args: ["things:index:v2", 0, 9, { rev: true }] },
        ],
      },
    ]);
  });

  it("honours the limit; 0 is empty; omitted is everything", async () => {
    await kvIndexAdd(index, "a", { score: 1 });
    await kvIndexAdd(index, "b", { score: 2 });
    expect(await kvIndexList(index, 1)).toEqual(["b"]);
    expect(await kvIndexList(index, 0)).toEqual([]);
    expect(await kvIndexList(index)).toEqual(["b", "a"]);
  });

  it("returns members as strings even when they look numeric", async () => {
    await kvIndexAdd(index, "123", { score: 1 });
    const [raw] = await fakeKv.zrange("things:index:v2", 0, -1);
    expect(raw).toBe(123); // what the real client hands back
    expect(await kvIndexList(index)).toEqual(["123"]);
  });
});

describe("legacy array migration (production deployment)", () => {
  it("seeds the sorted set in one MULTI, keeps the array's order, deletes the array", async () => {
    await fakeKv.set("things:index", ["c", "b", "a"]); // newest first, as the old code wrote it
    fakeKv.calls = [];

    expect(await kvIndexList(index)).toEqual(["c", "b", "a"]);

    const [read, migrate, reread] = fakeKv.calls;
    expect(read.op).toBe("pipeline");
    expect(migrate).toEqual({
      op: "multi",
      commands: [
        {
          op: "zadd",
          args: [
            "things:index:v2",
            { nx: true },
            { score: 2, member: "c" }, // rank from the oldest end: below any real timestamp
            { score: 1, member: "b" },
            { score: 0, member: "a" },
          ],
        },
        { op: "zremrangebyrank", args: ["things:index:v2", 0, -4] },
        { op: "del", args: ["things:index"] },
      ],
    });
    expect(reread).toEqual({ op: "zrange", args: ["things:index:v2", 0, -1, { rev: true }] });

    expect(await fakeKv.get("things:index")).toBeNull();
    // Later reads are the plain single pipeline again.
    fakeKv.calls = [];
    expect(await kvIndexList(index)).toEqual(["c", "b", "a"]);
    expect(fakeKv.calls).toHaveLength(1);
  });

  it("keeps entries added to the sorted set before the migration newer than the legacy ones", async () => {
    await fakeKv.set("things:index", ["b", "a"]);
    await kvIndexAdd(index, "c"); // a /start user right after the deploy: scored now
    expect(await kvIndexList(index)).toEqual(["c", "b", "a"]);
    expect(fakeKv.zsetScores("things:index:v2")).toMatchObject({ b: 1, a: 0 });
  });

  it("is idempotent: migrating the same array twice adds nothing and moves nothing", async () => {
    await fakeKv.set("things:index", ["b", "a"]);
    expect(await kvIndexList(index)).toEqual(["b", "a"]);
    await kvIndexAdd(index, "c");
    await fakeKv.set("things:index", ["b", "a"]); // a straggling old instance wrote it again
    expect(await kvIndexList(index)).toEqual(["c", "b", "a"]);
    expect(await fakeKv.zcard("things:index:v2")).toBe(3);
  });

  it("applies the cap while migrating", async () => {
    await fakeKv.set("things:index", ["e", "d", "c", "b", "a"]);
    expect(await kvIndexList(index)).toEqual(["e", "d", "c"]);
  });

  it("uses legacyEntry for members and timestamps, skipping unusable entries", async () => {
    const invites: KvIndex = {
      ...index,
      legacyEntry: (e) => {
        const { token, createdAt } = (e ?? {}) as { token?: string; createdAt?: string };
        return token ? { member: token, score: createdAt ? Date.parse(createdAt) : undefined } : null;
      },
    };
    await fakeKv.set("things:index", [
      { token: "t2", createdAt: "2026-01-02T00:00:00.000Z" },
      "garbage",
      { token: "t1", createdAt: "2026-01-01T00:00:00.000Z" },
      { token: "t0" }, // no timestamp: rank from the oldest end
    ]);
    expect(await kvIndexList(invites)).toEqual(["t2", "t1", "t0"]);
    expect(fakeKv.zsetScores("things:index:v2")).toEqual({
      t2: Date.parse("2026-01-02T00:00:00.000Z"),
      t1: Date.parse("2026-01-01T00:00:00.000Z"),
      t0: 0,
    });
  });

  it("migrates before a remove, so a legacy-only member can be removed", async () => {
    await fakeKv.set("things:index", ["b", "a"]);
    expect(await kvIndexRemove(index, "a")).toBe(true);
    expect(await fakeKv.get("things:index")).toBeNull();
    expect(await kvIndexList(index)).toEqual(["b"]);
  });

  it("drops an empty or malformed legacy value without seeding anything", async () => {
    await fakeKv.set("things:index", []);
    expect(await kvIndexList(index)).toEqual([]);
    expect(await fakeKv.get("things:index")).toBeNull();
    expect(fakeKv.commandsOf("zadd")).toEqual([]);

    await fakeKv.set("things:index", { not: "an array" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await kvIndexList(index)).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
    expect(await fakeKv.get("things:index")).toBeNull();
  });
});

describe("legacy array migration (preview deployment, shared production KV)", () => {
  beforeEach(() => enableFakeKvEnv("preview"));

  it("seeds the sorted set but leaves the array for the production code still reading it", async () => {
    await fakeKv.set("things:index", ["b", "a"]);
    fakeKv.calls = [];
    expect(await kvIndexList(index)).toEqual(["b", "a"]);
    const migrate = fakeKv.calls[1] as { op: string; commands: Array<{ op: string }> };
    expect(migrate.op).toBe("multi");
    expect(migrate.commands.map((c) => c.op)).toEqual(["zadd", "zremrangebyrank"]);
    expect(await fakeKv.get("things:index")).toEqual(["b", "a"]);
  });

  it("re-seeds on every read, picking up what production prepended meanwhile, in order", async () => {
    await fakeKv.set("things:index", ["b", "a"]);
    expect(await kvIndexList(index)).toEqual(["b", "a"]);
    await kvIndexAdd(index, "p"); // added here, on the preview
    await fakeKv.set("things:index", ["c", "b", "a"]); // production (old code) added c
    // c lands between p (a real timestamp) and the earlier legacy entries; the cap trims a.
    expect(await kvIndexList(index)).toEqual(["p", "c", "b"]);
    expect(fakeKv.zsetScores("things:index:v2")).toMatchObject({ c: 2, b: 1 });
    expect(await fakeKv.zcard("things:index:v2")).toBe(3);
  });

  it("does nothing for an empty legacy array (no empty transaction)", async () => {
    await fakeKv.set("things:index", []);
    fakeKv.calls = [];
    expect(await kvIndexList(index)).toEqual([]);
    expect(fakeKv.calls.map((c) => c.op)).toEqual(["pipeline", "zrange"]);
    expect(await fakeKv.get("things:index")).toEqual([]);
  });
});

describe("kvIndexClear", () => {
  it("deletes both keys", async () => {
    await fakeKv.set("things:index", ["a"]);
    await kvIndexAdd(index, "b", { score: 1 });
    await kvIndexClear(index);
    expect(fakeKv.calls.at(-1)).toEqual({ op: "del", args: ["things:index:v2", "things:index"] });
    expect(await kvIndexList(index)).toEqual([]);
  });
});
