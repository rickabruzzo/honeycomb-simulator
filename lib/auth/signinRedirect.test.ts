import { afterEach, describe, expect, it } from "vitest";
import { safeCallbackUrl, signinDestination } from "./signinRedirect";

afterEach(() => {
  delete process.env.AUTH_ALLOWED_DOMAIN;
});

describe("safeCallbackUrl", () => {
  it("keeps a same-site path with its query", () => {
    expect(safeCallbackUrl("/q/rick-abruzzo-yjvo?from=rick-abruzzo-3muh")).toBe("/q/rick-abruzzo-yjvo?from=rick-abruzzo-3muh");
    expect(safeCallbackUrl("/")).toBe("/");
  });

  it("falls back to /start for anything that could leave the site", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "/\\\\evil.com", "https://evil.com", "javascript:alert(1)", "/ evil", "/\tevil"]) {
      expect(safeCallbackUrl(bad), bad).toBe("/start");
    }
  });

  it("never sends someone back to the sign-in page itself", () => {
    expect(safeCallbackUrl("/signin")).toBe("/start");
    expect(safeCallbackUrl("/signin?callbackUrl=%2F")).toBe("/start");
  });

  it("copes with a missing or repeated query value", () => {
    expect(safeCallbackUrl(undefined)).toBe("/start");
    expect(safeCallbackUrl(["/leaderboard", "/evil"])).toBe("/leaderboard");
    expect(safeCallbackUrl(42)).toBe("/start");
  });
});

describe("signinDestination", () => {
  it("sends a signed-in colleague on to the page they wanted", () => {
    expect(signinDestination({ email: "rick@honeycomb.io", error: undefined, callbackUrl: "/quiz-results" })).toBe("/quiz-results");
  });

  it("shows the page instead of redirecting when nobody is signed in", () => {
    expect(signinDestination({ email: null, error: undefined, callbackUrl: "/start" })).toBeNull();
  });

  it("shows the page to a session from another domain instead of bouncing it back and forth", () => {
    expect(signinDestination({ email: "someone@gmail.com", error: "AccessDenied", callbackUrl: "/start" })).toBeNull();
    expect(signinDestination({ email: "someone@gmail.com", error: undefined, callbackUrl: "/start" })).toBeNull();
  });

  it("shows the page to a signed-in non-admin who was turned away", () => {
    expect(signinDestination({ email: "rick@honeycomb.io", error: "NotAdmin", callbackUrl: "/" })).toBeNull();
  });
});
