import { describe, expect, it } from "vitest";
import { checkOwnership } from "./ownership";
import type { Trainee } from "../traineeStore";

const rick: Trainee = { id: "rick-abruzzo-1", firstName: "Rick", lastName: "Abruzzo", email: "rick@honeycomb.io", createdAt: "" };
const legacy: Trainee = { id: "ken-rimple-1", firstName: "Ken", lastName: "Rimple", createdAt: "" };

describe("checkOwnership", () => {
  it("lets the link's own trainee through, case-insensitively", () => {
    expect(checkOwnership("Rick@Honeycomb.io", rick, false)).toBe("ok");
  });
  it("blocks another signed-in trainee", () => {
    expect(checkOwnership("maggie@honeycomb.io", rick, false)).toBe("wrong_person");
  });
  it("lets an admin open anyone's link", () => {
    expect(checkOwnership("maggie@honeycomb.io", rick, true)).toBe("ok");
  });
  it("attaches the email to a legacy trainee record that has none", () => {
    expect(checkOwnership("ken@honeycomb.io", legacy, false)).toBe("attach");
  });
  it("treats a missing session or an unknown trainee as not something to judge here", () => {
    expect(checkOwnership(null, rick, false)).toBe("unauthenticated");
    expect(checkOwnership("rick@honeycomb.io", null, false)).toBe("ok");
  });
});
