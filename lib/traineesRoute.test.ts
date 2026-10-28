import { beforeEach, describe, expect, it } from "vitest";
import { GET } from "../app/api/trainees/route";
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
