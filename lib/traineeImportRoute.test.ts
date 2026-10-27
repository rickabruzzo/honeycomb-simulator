import { beforeEach, describe, expect, it } from "vitest";
import { POST } from "../app/api/trainees/import/route";
import { getMemStore } from "./memoryStore";
import { listTrainees, upsertTrainee } from "./traineeStore";

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/trainees/import", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  const mem = getMemStore();
  mem.trainees.clear();
  mem.traineeIndex.length = 0;
});

describe("POST /api/trainees/import", () => {
  it("previews the plan without saving anything", async () => {
    await upsertTrainee({ firstName: "Rick", lastName: "Abruzzo" });
    const res = await post({ csv: "Rick,Abruzzo,rick@example.com\nNew,Person\n" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plan.create).toHaveLength(1);
    expect(body.plan.update).toHaveLength(1);
    expect(body.applied).toBeUndefined();
    expect(await listTrainees()).toHaveLength(1);
  });

  it("applies the plan when committed", async () => {
    const rick = await upsertTrainee({ firstName: "Rick", lastName: "Abruzzo" });
    const res = await post({ csv: "Rick,Abruzzo,rick@example.com\nNew,Person,new@example.com\n", commit: true });
    const body = await res.json();
    expect(body.applied).toEqual({ created: 1, updated: 1 });
    const all = await listTrainees();
    expect(all).toHaveLength(2);
    expect(all.find((t) => t.id === rick.id)?.email).toBe("rick@example.com");
    expect(all.find((t) => t.firstName === "New")?.email).toBe("new@example.com");
  });

  it("rejects a missing csv body", async () => {
    const res = await post({});
    expect(res.status).toBe(400);
  });
});
