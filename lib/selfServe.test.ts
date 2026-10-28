import { beforeEach, describe, expect, it } from "vitest";
import { getMemStore } from "./memoryStore";
import { getSelfServeInvite, pickSelfServeNext, rememberSelfServeInvite } from "./selfServe";

describe("pickSelfServeNext", () => {
  const create = () => {
    let n = 0;
    const fn = async () => `qa-quiztest-new${++n}`;
    return { fn, calls: () => n };
  };

  it("creates a session when the person has none, and sends them to the quiz first", async () => {
    const c = create();
    const r = await pickSelfServeNext({ passed: false, quizToken: "qa-quiztest-q1", existing: null, createInvite: c.fn });
    expect(c.calls()).toBe(1);
    expect(r).toEqual({ next: "/q/qa-quiztest-q1?from=qa-quiztest-new1", inviteToken: "qa-quiztest-new1", reused: false });
  });

  it("resumes a session that is still open and unscored instead of making another", async () => {
    const c = create();
    const r = await pickSelfServeNext({
      passed: true,
      quizToken: "q",
      existing: { token: "qa-quiztest-old1", resumable: true },
      createInvite: c.fn,
    });
    expect(r).toEqual({ next: "/s/qa-quiztest-old1", inviteToken: "qa-quiztest-old1", reused: true });
    expect(c.calls()).toBe(0);
  });

  it("starts a fresh session once the last one is scored, ended or gone", async () => {
    const c = create();
    const r = await pickSelfServeNext({
      passed: true,
      quizToken: "q",
      existing: { token: "qa-quiztest-old1", resumable: false },
      createInvite: c.fn,
    });
    expect(r.reused).toBe(false);
    expect(r.next).toBe("/s/qa-quiztest-new1");
  });
});

describe("self-serve invite memory", () => {
  beforeEach(() => getMemStore().quiz.clear());

  it("remembers the latest invite token per trainee", async () => {
    expect(await getSelfServeInvite("qa-quiztest-1234")).toBeNull();
    await rememberSelfServeInvite("qa-quiztest-1234", "qa-quiztest-a1b2");
    expect(await getSelfServeInvite("qa-quiztest-1234")).toBe("qa-quiztest-a1b2");
  });
});
