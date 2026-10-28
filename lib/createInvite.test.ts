import { beforeEach, describe, expect, it } from "vitest";
import { createInvite } from "./createInvite";
import { getInvite } from "./invites";
import { listInvitesFromIndex } from "./inviteIndex";
import { getMemStore } from "./memoryStore";
import { ensurePersonasSeeded, listPersonas } from "./personaStore";
import { getSession } from "./storage";
import { upsertTrainee } from "./traineeStore";

// In-memory store (no KV env in vitest). Background enrichment is replaced with a no-op.
const noAfter = () => {};

beforeEach(() => {
  const mem = getMemStore();
  mem.trainees.clear();
  mem.traineeIndex.length = 0;
  mem.invites.clear();
  mem.inviteOrder = [];
  mem.sessions.clear();
});

describe("createInvite", () => {
  it("creates a readable practice link, its session and a tracker row", async () => {
    await ensurePersonasSeeded();
    const [persona] = await listPersonas(false);
    const trainee = await upsertTrainee({ firstName: "Quiz", lastName: "Tester" });

    const res = await createInvite(
      { personaId: persona.id, traineeId: trainee.id, createdBy: "self-serve" },
      { runAfter: noAfter }
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.token).toMatch(/^quiz-tester-[a-z0-9]{4}$/);
    expect(res.url).toBe(`/s/${res.token}`);
    expect(await getInvite(res.token)).toMatchObject({
      traineeId: trainee.id,
      personaId: persona.id,
      createdBy: "self-serve",
      trainingWheels: false,
      sessionId: res.sessionId,
    });
    expect((await getSession(res.sessionId))?.kickoff.traineeId).toBe(trainee.id);
    expect(await listInvitesFromIndex()).toContain(res.token);
  });

  it("rejects an unknown persona without writing anything", async () => {
    const trainee = await upsertTrainee({ firstName: "Quiz", lastName: "Tester" });
    const res = await createInvite({ personaId: "not-a-persona", traineeId: trainee.id }, { runAfter: noAfter });
    expect(res.ok).toBe(false);
    expect(await listInvitesFromIndex()).toEqual([]);
  });

  it("rejects an unknown trainee when no name is given to register", async () => {
    await ensurePersonasSeeded();
    const [persona] = await listPersonas(false);
    const res = await createInvite({ personaId: persona.id, traineeId: "ghost-xyz1" }, { runAfter: noAfter });
    expect(res).toEqual({ ok: false, status: 400, error: "Trainee not found and no traineeName provided" });
  });
});
