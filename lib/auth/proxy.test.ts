import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The real `auth(handler)` wrapper decodes the session cookie and hands the handler a request
// with `.auth` set. Here the wrapper is the identity, and each test sets `.auth` itself.
vi.mock("@/auth", () => ({ auth: (handler: unknown) => handler }));

import proxy from "../../proxy";

type Session = { user: { email: string } } | null;
const gate = proxy as unknown as (req: NextRequest) => Response | Promise<Response>;

async function run(path: string, { method = "GET", session = null as Session } = {}) {
  const req = new NextRequest(`https://sim.example${path}`, { method });
  Object.assign(req, { auth: session });
  return gate(req);
}
const passedThrough = (res: Response) => res.headers.get("x-middleware-next") === "1";
const location = (res: Response) => res.headers.get("location");

afterEach(() => {
  delete process.env.ADMIN_EMAILS;
});

describe("the sign-in gate", () => {
  it("sends a signed-out visitor to sign in and back to the page they wanted", async () => {
    const res = await run("/start");
    expect(res.status).toBe(307);
    expect(location(res)).toBe("https://sim.example/signin?callbackUrl=%2Fstart");
  });

  it("answers a signed-out API call with 401 JSON", async () => {
    const res = await run("/api/start", { method: "POST" });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("leaves share links and the APIs they read open", async () => {
    expect(passedThrough(await run("/leaderboard/share"))).toBe(true);
    expect(passedThrough(await run("/api/trainees"))).toBe(true);
  });

  it("turns a session from another domain away with a reason", async () => {
    const res = await run("/start", { session: { user: { email: "someone@gmail.com" } } });
    expect(res.status).toBe(307);
    expect(location(res)).toBe("https://sim.example/signin?callbackUrl=%2Fstart&error=AccessDenied");
  });

  it("lets a signed-in trainee run their own practice session and quiz", async () => {
    const maggie = { user: { email: "maggie@honeycomb.io" } };
    process.env.ADMIN_EMAILS = "rick@honeycomb.io";
    expect(passedThrough(await run("/s/maggie-ennis-qwr8", { session: maggie }))).toBe(true);
    expect(passedThrough(await run("/api/invite/maggie-ennis-qwr8", { session: maggie }))).toBe(true);
    expect(passedThrough(await run("/api/session/abc/message", { method: "POST", session: maggie }))).toBe(true);
    expect(passedThrough(await run("/api/quiz/maggie-ennis-x9k2/answer", { method: "POST", session: maggie }))).toBe(true);
  });

  it("keeps admin pages and admin APIs from a signed-in non-admin", async () => {
    const maggie = { user: { email: "maggie@honeycomb.io" } };
    process.env.ADMIN_EMAILS = "rick@honeycomb.io";
    const page = await run("/", { session: maggie });
    expect(page.status).toBe(307);
    expect(location(page)).toBe("https://sim.example/signin?error=NotAdmin");
    for (const [p, m] of [
      ["/api/trainees?include=email", "GET"], ["/api/invite/maggie-ennis-qwr8", "DELETE"], ["/api/session/abc", "GET"],
    ] as const) {
      expect((await run(p, { method: m, session: maggie })).status, `${m} ${p}`).toBe(403);
    }
  });

  it("lets an admin do all of that", async () => {
    const rick = { user: { email: "rick@honeycomb.io" } };
    process.env.ADMIN_EMAILS = "rick@honeycomb.io";
    expect(passedThrough(await run("/", { session: rick }))).toBe(true);
    expect(passedThrough(await run("/api/trainees?include=email", { session: rick }))).toBe(true);
    expect(passedThrough(await run("/api/invite/x", { method: "DELETE", session: rick }))).toBe(true);
  });
});
