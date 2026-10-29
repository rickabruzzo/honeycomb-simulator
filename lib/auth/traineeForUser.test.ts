import { beforeEach, describe, expect, it } from "vitest";
import { getMemStore } from "../memoryStore";
import { getTrainee, listTrainees, upsertTrainee } from "../traineeStore";
import { traineeForUser } from "./traineeForUser";

beforeEach(() => {
  const mem = getMemStore();
  mem.trainees.clear();
  mem.traineeIndex.length = 0;
});

describe("traineeForUser", () => {
  it("finds the trainee by the signed-in email", async () => {
    const t = await upsertTrainee({ firstName: "Rick", lastName: "Abruzzo", email: "rick@honeycomb.io" });
    const found = await traineeForUser({ email: "Rick@Honeycomb.io", name: "Richard Abruzzo" });
    expect(found.id).toBe(t.id);
    expect(await listTrainees()).toHaveLength(1);
  });

  it("attaches the email to a same-name trainee that has none instead of creating a duplicate", async () => {
    const t = await upsertTrainee({ firstName: "Maggie", lastName: "Ennis" });
    const found = await traineeForUser({ email: "maggieennis@honeycomb.io", givenName: "Maggie", familyName: "Ennis" });
    expect(found.id).toBe(t.id);
    expect(found.email).toBe("maggieennis@honeycomb.io");
    expect(await listTrainees()).toHaveLength(1);
  });

  it("never takes over a same-name record that belongs to a different email", async () => {
    const rick = await upsertTrainee({ firstName: "Rick", lastName: "Abruzzo", email: "rick@honeycomb.io" });
    const other = await traineeForUser({ email: "rick2@honeycomb.io", name: "Rick Abruzzo", givenName: "Rick", familyName: "Abruzzo" });
    expect(other.id).not.toBe(rick.id);
    expect(other.email).toBe("rick2@honeycomb.io");
    expect((await getTrainee(rick.id))?.email).toBe("rick@honeycomb.io");
    expect(await listTrainees()).toHaveLength(2);
  });

  it("creates a trainee from the Google given/family name", async () => {
    const made = await traineeForUser({ email: "ken@honeycomb.io", givenName: "Ken", familyName: "Rimple", name: "Ken Rimple" });
    expect(made).toMatchObject({ firstName: "Ken", lastName: "Rimple", email: "ken@honeycomb.io" });
  });

  it("falls back to splitting the display name, then to the email's local part", async () => {
    const a = await traineeForUser({ email: "jt@honeycomb.io", name: "Jessi Tron" });
    expect(a).toMatchObject({ firstName: "Jessi", lastName: "Tron" });
    const b = await traineeForUser({ email: "solo.person@honeycomb.io", name: "Solo" });
    expect(b).toMatchObject({ firstName: "Solo", lastName: "" });
    const c = await traineeForUser({ email: "nameless@honeycomb.io" });
    expect(c).toMatchObject({ firstName: "nameless", lastName: "" });
  });
});
