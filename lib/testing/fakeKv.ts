/**
 * In-memory stand-in for the `@vercel/kv` client, for tests of the KV code paths (vitest has no
 * KV, so the stores normally run on the memory store). Implements the commands the stores use —
 * strings, MGET, DEL, sorted sets, pipeline()/multi() — with Redis semantics for ranks and
 * negative indexes, and records every call so a test can assert the exact command sequence,
 * e.g. that an index add is ONE multi of [zadd, zremrangebyrank] and never a read-modify-write.
 *
 * Like the real client, string members go over the wire unquoted and every reply is run through
 * JSON.parse where it parses, so a member "123" comes back as the number 123 — callers coerce.
 *
 * Use:
 *   vi.mock("@vercel/kv", async () => ({ kv: (await import("./testing/fakeKv")).fakeKv }));
 *   import { fakeKv } from "./testing/fakeKv";
 *   beforeEach(() => { fakeKv.reset(); enableFakeKvEnv(); });
 *   afterEach(() => vi.unstubAllEnvs());
 * useKv() is then true (vitest's NODE_ENV is "test", not "development").
 */
import { vi } from "vitest";

export type RecordedCommand = { op: string; args: unknown[] };
export type RecordedCall =
  | RecordedCommand
  | { op: "multi" | "pipeline"; commands: RecordedCommand[] };

type Entry =
  | { kind: "string"; value: unknown }
  | { kind: "zset"; members: Map<string, number> };

export interface FakePipeline {
  get(key: string): FakePipeline;
  set(key: string, value: unknown, opts?: unknown): FakePipeline;
  del(...keys: unknown[]): FakePipeline;
  mget(...keys: unknown[]): FakePipeline;
  exists(...keys: unknown[]): FakePipeline;
  zadd(key: string, ...rest: unknown[]): FakePipeline;
  zrem(key: string, ...members: unknown[]): FakePipeline;
  zrange(key: string, start: number, stop: number, opts?: unknown): FakePipeline;
  zremrangebyrank(key: string, start: number, stop: number): FakePipeline;
  zcard(key: string): FakePipeline;
  exec(): Promise<unknown[]>;
  length(): number;
}

const PIPELINE_OPS = [
  "get",
  "set",
  "del",
  "mget",
  "exists",
  "zadd",
  "zrem",
  "zrange",
  "zremrangebyrank",
  "zcard",
] as const;

const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

const flat = (args: unknown[]): unknown[] => args.flat();

/** What the real client does to every reply string (`parseRecursive`). */
function deserialize(raw: string): unknown {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "number" && parsed.toString() !== raw) return raw;
    return parsed;
  } catch {
    return raw;
  }
}

/** Redis' rank → index conversion for ZRANGE / ZREMRANGEBYRANK (negative counts from the end). */
function rankRange(start: number, stop: number, length: number): [number, number] | null {
  let s = start < 0 ? length + start : start;
  let e = stop < 0 ? length + stop : stop;
  if (s < 0) s = 0;
  if (e >= length) e = length - 1;
  if (s > e || s >= length) return null;
  return [s, e];
}

function isScoreMember(v: unknown): v is { score: number; member: unknown } {
  return Boolean(v) && typeof v === "object" && "score" in (v as object) && "member" in (v as object);
}

export class FakeKv {
  data = new Map<string, Entry>();
  calls: RecordedCall[] = [];

  reset(): void {
    this.data.clear();
    this.calls = [];
  }

  /** Every recorded command of this op — top-level or inside a pipeline/multi — in order. */
  commandsOf(op: string): RecordedCommand[] {
    const out: RecordedCommand[] = [];
    for (const c of this.calls) {
      if ("commands" in c) out.push(...c.commands.filter((x) => x.op === op));
      else if (c.op === op) out.push(c);
    }
    return out;
  }

  /** Members of a sorted set, highest score first (what "newest first" readers get). */
  zsetMembers(key: string): string[] {
    return this.sorted(key)
      .reverse()
      .map(([m]) => m);
  }

  /** member → score for a sorted set. */
  zsetScores(key: string): Record<string, number> {
    return Object.fromEntries(this.sorted(key));
  }

  // ── client surface (what the stores call) ─────────────────────────────────

  get = async <T = unknown>(key: string): Promise<T | null> => this.call("get", [key]) as T | null;
  set = async (key: string, value: unknown, opts?: unknown): Promise<"OK"> =>
    this.call("set", opts === undefined ? [key, value] : [key, value, opts]) as "OK";
  del = async (...keys: unknown[]): Promise<number> => this.call("del", keys) as number;
  mget = async <T = unknown[]>(...keys: unknown[]): Promise<T> => this.call("mget", keys) as T;
  exists = async (...keys: unknown[]): Promise<number> => this.call("exists", keys) as number;
  zadd = async (key: string, ...rest: unknown[]): Promise<number> =>
    this.call("zadd", [key, ...rest]) as number;
  zrem = async (key: string, ...members: unknown[]): Promise<number> =>
    this.call("zrem", [key, ...members]) as number;
  zrange = async <T = unknown[]>(key: string, start: number, stop: number, opts?: unknown): Promise<T> =>
    this.call("zrange", opts === undefined ? [key, start, stop] : [key, start, stop, opts]) as T;
  zremrangebyrank = async (key: string, start: number, stop: number): Promise<number> =>
    this.call("zremrangebyrank", [key, start, stop]) as number;
  zcard = async (key: string): Promise<number> => this.call("zcard", [key]) as number;
  pipeline = (): FakePipeline => this.pipe("pipeline");
  multi = (): FakePipeline => this.pipe("multi");

  // ── internals ─────────────────────────────────────────────────────────────

  private call(op: string, args: unknown[]): unknown {
    this.calls.push({ op, args: clone(args) });
    return this.run(op, args);
  }

  private pipe(kind: "multi" | "pipeline"): FakePipeline {
    const queued: RecordedCommand[] = [];
    const p = {
      exec: async (): Promise<unknown[]> => {
        if (!queued.length) throw new Error("Pipeline is empty");
        this.calls.push({ op: kind, commands: clone(queued) });
        return queued.map((c) => this.run(c.op, c.args));
      },
      length: () => queued.length,
    } as FakePipeline;
    for (const op of PIPELINE_OPS) {
      (p as unknown as Record<string, unknown>)[op] = (...args: unknown[]) => {
        queued.push({ op, args });
        return p;
      };
    }
    return p;
  }

  private entry(key: string, kind: Entry["kind"]): Entry | undefined {
    const e = this.data.get(key);
    if (e && e.kind !== kind) {
      throw new Error(`WRONGTYPE ${key}: wanted ${kind}, holds ${e.kind}`);
    }
    return e;
  }

  private zset(key: string, create: boolean): Map<string, number> | undefined {
    const e = this.entry(key, "zset");
    if (e) return (e as Extract<Entry, { kind: "zset" }>).members;
    if (!create) return undefined;
    const members = new Map<string, number>();
    this.data.set(key, { kind: "zset", members });
    return members;
  }

  /** [member, score] pairs by ascending score, ties by member — Redis' rank order. */
  private sorted(key: string): Array<[string, number]> {
    const z = this.zset(key, false);
    if (!z) return [];
    return [...z.entries()].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  }

  private dropIfEmpty(key: string): void {
    const z = this.zset(key, false);
    if (z && z.size === 0) this.data.delete(key);
  }

  private run(op: string, args: unknown[]): unknown {
    const key = String(args[0]);
    switch (op) {
      case "get": {
        const e = this.entry(key, "string");
        return e ? clone((e as Extract<Entry, { kind: "string" }>).value) : null;
      }
      case "set": {
        this.data.set(key, { kind: "string", value: clone(args[1]) });
        return "OK";
      }
      case "del": {
        let n = 0;
        for (const k of flat(args)) if (this.data.delete(String(k))) n++;
        return n;
      }
      case "mget": {
        return flat(args).map((k) => {
          const e = this.data.get(String(k));
          return e?.kind === "string" ? clone(e.value) : null;
        });
      }
      case "exists": {
        return flat(args).filter((k) => this.data.has(String(k))).length;
      }
      case "zcard": {
        return this.zset(key, false)?.size ?? 0;
      }
      case "zadd": {
        let nx = false;
        let xx = false;
        const pairs: Array<{ score: number; member: unknown }> = [];
        for (const r of args.slice(1)) {
          if (isScoreMember(r)) pairs.push(r);
          else if (r && typeof r === "object") {
            nx = Boolean((r as { nx?: boolean }).nx);
            xx = Boolean((r as { xx?: boolean }).xx);
          }
        }
        if (!pairs.length) throw new Error("ERR wrong number of arguments for 'zadd' command");
        const z = this.zset(key, true)!;
        let added = 0;
        for (const { score, member } of pairs) {
          const m = String(member);
          const has = z.has(m);
          if ((nx && has) || (xx && !has)) continue;
          if (!has) added++;
          z.set(m, score);
        }
        return added;
      }
      case "zrem": {
        const z = this.zset(key, false);
        if (!z) return 0;
        let n = 0;
        for (const m of flat(args.slice(1))) if (z.delete(String(m))) n++;
        this.dropIfEmpty(key);
        return n;
      }
      case "zrange": {
        const [, start, stop, opts] = args as [string, number, number, { rev?: boolean; withScores?: boolean } | undefined];
        const sorted = this.sorted(key);
        if (opts?.rev) sorted.reverse();
        const r = rankRange(start, stop, sorted.length);
        if (!r) return [];
        const slice = sorted.slice(r[0], r[1] + 1);
        return opts?.withScores
          ? slice.flatMap(([m, s]) => [deserialize(m), s])
          : slice.map(([m]) => deserialize(m));
      }
      case "zremrangebyrank": {
        const [, start, stop] = args as [string, number, number];
        const sorted = this.sorted(key);
        const r = rankRange(start, stop, sorted.length);
        if (!r) return 0;
        const z = this.zset(key, false)!;
        for (const [m] of sorted.slice(r[0], r[1] + 1)) z.delete(m);
        this.dropIfEmpty(key);
        return r[1] - r[0] + 1;
      }
      default:
        throw new Error(`FakeKv: unsupported command ${op}`);
    }
  }
}

/** Shared instance: the vi.mock factory and the test file both import this same module. */
export const fakeKv = new FakeKv();

/**
 * Make useKv() true for the rest of the test (pair with vi.unstubAllEnvs() in afterEach), as the
 * production deployment by default — the steady state — or as a preview, which shares the
 * production KV and must not delete legacy index arrays (see lib/kvIndex.ts).
 */
export function enableFakeKvEnv(deployment: "production" | "preview" = "production"): void {
  vi.stubEnv("KV_REST_API_URL", "https://fake-kv.test");
  vi.stubEnv("KV_REST_API_TOKEN", "fake-token");
  vi.stubEnv("VERCEL_ENV", deployment);
}
