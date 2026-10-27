import { beforeEach, describe, expect, it } from "vitest";
import { getMemStore } from "./memoryStore";
import {
  findTraineeByEmail,
  findTraineeByName,
  normalizeEmail,
  upsertTrainee,
} from "./traineeStore";

// vitest has no KV env, so the store runs on the in-memory globalThis store.
beforeEach(() => {
  const mem = getMemStore();
  mem.trainees.clear();
  mem.traineeIndex.length = 0;
});

describe("trainee email", () => {
  it("stores the email trimmed and lowercased", async () => {
    const t = await upsertTrainee({
      firstName: "Quiz",
      lastName: "Tester",
      email: " Quiz.Tester@Example.com ",
    });
    expect(t.email).toBe("quiz.tester@example.com");
  });

  it("keeps the stored email when an upsert by name passes none", async () => {
    await upsertTrainee({ firstName: "Quiz", lastName: "Tester", email: "qt@example.com" });
    const again = await upsertTrainee({ firstName: "Quiz", lastName: "Tester" });
    expect(again.email).toBe("qt@example.com");
  });

  it("finds a trainee by name regardless of case and spacing", async () => {
    const t = await upsertTrainee({ firstName: "Quiz", lastName: "Tester" });
    const found = await findTraineeByName("quiz ", "  TESTER");
    expect(found?.id).toBe(t.id);
    expect(await findTraineeByName("Nobody", "Here")).toBeNull();
  });

  it("finds a trainee by email regardless of case", async () => {
    const t = await upsertTrainee({ firstName: "Quiz", lastName: "Tester", email: "qt@example.com" });
    const found = await findTraineeByEmail("QT@Example.com");
    expect(found?.id).toBe(t.id);
    expect(await findTraineeByEmail("missing@example.com")).toBeNull();
  });

  it("rejects malformed emails", () => {
    expect(normalizeEmail("nope")).toBeNull();
    expect(normalizeEmail("a@b")).toBeNull();
    expect(normalizeEmail("  A@B.co ")).toBe("a@b.co");
  });
});
