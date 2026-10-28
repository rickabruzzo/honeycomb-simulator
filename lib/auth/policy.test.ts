import { describe, expect, it } from "vitest";
import { authDisabled, isAdminApi, isAdminEmail, isAdminPath, isAllowedEmail, isOpenPath } from "./policy";

describe("isOpenPath", () => {
  it("keeps share links and the GET APIs they read open", () => {
    for (const p of ["/share/rick-abruzzo-7f3a", "/leaderboard/share", "/insights/share", "/api/share/x", "/signin"]) {
      expect(isOpenPath(p, "GET"), p).toBe(true);
    }
    for (const p of ["/api/leaderboard", "/api/insights", "/api/personas", "/api/conferences", "/api/trainees"]) {
      expect(isOpenPath(p, "GET"), p).toBe(true);
    }
    expect(isOpenPath("/api/auth/callback/google", "POST")).toBe(true);
    expect(isOpenPath("/_next/static/chunk.js", "GET")).toBe(true);
    expect(isOpenPath("/brand/logo.svg", "GET")).toBe(true);
  });

  it("gates everything else, and mutations on the open APIs", () => {
    for (const p of ["/", "/start", "/q/rick-abruzzo-x7k2", "/s/rick-abruzzo-7f3a", "/quiz-results", "/api/start", "/api/trainees/import", "/api/invite/create"]) {
      expect(isOpenPath(p, "GET"), p).toBe(false);
    }
    expect(isOpenPath("/api/leaderboard/reset", "POST")).toBe(false);
    expect(isOpenPath("/api/leaderboard/entry/abc", "DELETE")).toBe(false);
    expect(isOpenPath("/api/trainees", "POST")).toBe(false);
    // Names are open for the shared pages' filters; asking for emails is an admin request.
    expect(isOpenPath("/api/trainees", "GET", "?include=email")).toBe(false);
  });
});

describe("isAllowedEmail", () => {
  it("accepts the configured domain only, case-insensitively", () => {
    expect(isAllowedEmail("rick@honeycomb.io", "honeycomb.io")).toBe(true);
    expect(isAllowedEmail("Rick@Honeycomb.IO", "honeycomb.io")).toBe(true);
    expect(isAllowedEmail("rick@gmail.com", "honeycomb.io")).toBe(false);
    expect(isAllowedEmail("rick@honeycomb.io.evil.com", "honeycomb.io")).toBe(false);
    expect(isAllowedEmail(null, "honeycomb.io")).toBe(false);
  });
});

describe("isAdminEmail", () => {
  it("treats every allowed user as an admin when no list is configured", () => {
    expect(isAdminEmail("rick@honeycomb.io", undefined, "honeycomb.io")).toBe(true);
    expect(isAdminEmail("rick@gmail.com", undefined, "honeycomb.io")).toBe(false);
  });
  it("honours ADMIN_EMAILS when set", () => {
    expect(isAdminEmail("rick@honeycomb.io", "rick@honeycomb.io, maggie@honeycomb.io", "honeycomb.io")).toBe(true);
    expect(isAdminEmail("ken@honeycomb.io", "rick@honeycomb.io", "honeycomb.io")).toBe(false);
  });
});

describe("isAdminPath", () => {
  it("names the admin pages and leaves trainee pages alone", () => {
    for (const p of ["/", "/admin", "/editor", "/leaderboard", "/insights", "/quiz-results", "/review/abc"]) {
      expect(isAdminPath(p), p).toBe(true);
    }
    for (const p of ["/start", "/q/x", "/s/x", "/study", "/share/x", "/leaderboard/share", "/insights/share"]) {
      expect(isAdminPath(p), p).toBe(false);
    }
  });
});

describe("isAdminApi", () => {
  it("marks the admin-only APIs and leaves the trainee flow's APIs to plain sign-in", () => {
    for (const [p, m] of [
      ["/api/admin/invites", "GET"], ["/api/bootstrap", "GET"], ["/api/quiz-links", "GET"], ["/api/quiz-links/x", "DELETE"],
      ["/api/invite/create", "POST"], ["/api/trainees", "POST"], ["/api/trainees/import", "POST"], ["/api/trainees/x", "DELETE"],
      ["/api/leaderboard/reset", "POST"], ["/api/leaderboard/entry/x", "DELETE"], ["/api/personas", "POST"], ["/api/review/x", "GET"],
    ] as const) {
      expect(isAdminApi(p, m), `${m} ${p}`).toBe(true);
    }
    for (const [p, m] of [
      ["/api/start", "POST"], ["/api/quiz/x", "POST"], ["/api/quiz/x/answer", "POST"], ["/api/quiz/study", "GET"],
      ["/api/session/x/message", "POST"], ["/api/invite/x", "GET"], ["/api/quiz/for-invite/x", "GET"],
    ] as const) {
      expect(isAdminApi(p, m), `${m} ${p}`).toBe(false);
    }
  });
});

describe("authDisabled", () => {
  it("only honours AUTH_MODE=off in development", () => {
    expect(authDisabled({ AUTH_MODE: "off", NODE_ENV: "development" })).toBe(true);
    expect(authDisabled({ AUTH_MODE: "off", NODE_ENV: "production" })).toBe(false);
    expect(authDisabled({ NODE_ENV: "development" })).toBe(false);
  });
});
