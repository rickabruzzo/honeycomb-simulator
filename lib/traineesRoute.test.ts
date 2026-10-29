import { beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "../app/api/trainees/route";
import { getMemStore } from "./memoryStore";
import { upsertTrainee } from "./traineeStore";

beforeEach(() => {
  const mem = getMemStore();
  mem.trainees.clear();
  mem.traineeIndex.length = 0;
});

// Shared leaderboard/insights pages fetch this list for a filter, so by default it must not
// carry emails; the admin pages ask for them explicitly.
describe("GET /api/trainees", () => {
  it("leaves emails out unless the caller asks for them", async () => {
    await upsertTrainee({ firstName: "QA", lastName: "Tester", email: "qa@example.com" });
    const plain = await (await GET(new Request("http://localhost/api/trainees"))).json();
    expect(plain.trainees).toHaveLength(1);
    expect(JSON.stringify(plain)).not.toContain("@");
    const withEmail = await (await GET(new Request("http://localhost/api/trainees?include=email"))).json();
    expect(withEmail.trainees[0].email).toBe("qa@example.com");
  });
});

describe("POST /api/trainees", () => {
  const post = (body: unknown) =>
    POST(new Request("http://localhost/api/trainees", { method: "POST", body: JSON.stringify(body) }) as never);

  it("refuses an email that already belongs to a different trainee", async () => {
    await upsertTrainee({ firstName: "Maggie", lastName: "Ennis", email: "maggie@example.com" });
    const res = await post({ firstName: "Rick", lastName: "Abruzzo", email: "maggie@example.com" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Maggie Ennis/);
  });

  it("still lets the same trainee keep or update their own email", async () => {
    await upsertTrainee({ firstName: "Maggie", lastName: "Ennis", email: "maggie@example.com" });
    const res = await post({ firstName: "Maggie", lastName: "Ennis", email: "maggie@example.com" });
    expect(res.status).toBe(200);
  });
});
