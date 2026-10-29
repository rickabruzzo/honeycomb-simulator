import { describe, expect, it } from "vitest";
import { showAdminTabs } from "./tabsVisibility";

describe("admin tabs visibility", () => {
  it("shows the tabs to an admin on trainee-facing pages like /start", () => {
    expect(showAdminTabs("/start", true)).toBe(true);
    expect(showAdminTabs("/s/rick-abruzzo-yjvo", true)).toBe(true);
    expect(showAdminTabs("/q/rick-abruzzo-yjvo", true)).toBe(true);
    expect(showAdminTabs("/study", true)).toBe(true);
    expect(showAdminTabs("/", true)).toBe(true);
  });

  it("never shows them to a non-admin, even on pages that used to show them", () => {
    expect(showAdminTabs("/start", false)).toBe(false);
    expect(showAdminTabs("/", false)).toBe(false);
    expect(showAdminTabs("/study", false)).toBe(false);
  });

  it("keeps the sign-in page and shared views free of tabs for everyone", () => {
    for (const p of ["/signin", "/leaderboard/share", "/insights/share", "/share/abc123"]) {
      expect(showAdminTabs(p, true)).toBe(false);
    }
  });

  it("treats an unknown pathname as hidden", () => {
    expect(showAdminTabs(null, true)).toBe(false);
  });
});
