import { describe, expect, it } from "vitest";
import { readableToken, uniqueToken } from "./readableToken";

describe("readableToken", () => {
  it("is the name slug plus a 4-character suffix", () => {
    const t = readableToken("Rick Abruzzo");
    expect(t).toMatch(/^rick-abruzzo-[a-z0-9]{4}$/);
  });

  it("falls back to 'trainee' when the name has nothing to slug", () => {
    expect(readableToken("   ")).toMatch(/^trainee-[a-z0-9]{4}$/);
    expect(readableToken("!!!")).toMatch(/^trainee-[a-z0-9]{4}$/);
  });

  it("avoids look-alike characters in the suffix", () => {
    for (let i = 0; i < 300; i++) {
      const suffix = readableToken("A B").split("-").pop()!;
      expect(suffix).not.toMatch(/[01oil]/);
    }
  });

  it("draws distinct suffixes", () => {
    const seen = new Set(Array.from({ length: 200 }, () => readableToken("Rick Abruzzo")));
    expect(seen.size).toBe(200);
  });
});

describe("uniqueToken", () => {
  it("retries when the first draw already exists", async () => {
    const tried: string[] = [];
    const t = await uniqueToken("Rick Abruzzo", async (candidate) => {
      tried.push(candidate);
      return tried.length === 1; // first candidate is taken
    });
    expect(tried).toHaveLength(2);
    expect(t).toBe(tried[1]);
  });

  it("falls back to a longer suffix when short ones keep colliding", async () => {
    let calls = 0;
    const t = await uniqueToken("Rick Abruzzo", async () => ++calls <= 5);
    expect(t).toMatch(/^rick-abruzzo-[a-z0-9]{8}$/);
  });
});
