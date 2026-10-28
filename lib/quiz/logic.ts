/**
 * Pure quiz logic: drawing an attempt, grading, and shaping what the client may see.
 * No storage here, so it's unit-testable.
 */
import type {
  AttemptItem,
  ClientQuestion,
  Grade,
  QuizAttempt,
  QuizBank,
  QuizQuestion,
  QuizResult,
} from "./types";

type Rng = () => number;

export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Same scale as the simulator scorecard. */
export function gradeFor(percent: number): Grade {
  if (percent >= 90) return "A";
  if (percent >= 78) return "B";
  if (percent >= 65) return "C";
  if (percent >= 50) return "D";
  return "F";
}

/**
 * Draw `count` questions spread as evenly as possible across modules (e.g. 15 over 6 modules is
 * three modules x3 and three x2, which modules get the extra one is random), preferring
 * questions the trainee didn't see last time.
 */
export function drawQuestions(
  questions: QuizQuestion[],
  count: number,
  avoidIds: ReadonlySet<string> = new Set(),
  rng: Rng = Math.random
): QuizQuestion[] {
  const byModule = new Map<string, QuizQuestion[]>();
  for (const q of questions) {
    const list = byModule.get(q.module) ?? [];
    list.push(q);
    byModule.set(q.module, list);
  }
  // Fresh questions first (shuffled), then repeats (shuffled), per module.
  const pools = new Map<string, QuizQuestion[]>();
  for (const [mod, list] of byModule) {
    const fresh = shuffle(list.filter((q) => !avoidIds.has(q.id)), rng);
    const seen = shuffle(list.filter((q) => avoidIds.has(q.id)), rng);
    pools.set(mod, [...fresh, ...seen]);
  }

  const picked: QuizQuestion[] = [];
  // Round-robin over modules in a random order until we have enough or run dry.
  const order = shuffle([...pools.keys()], rng);
  while (picked.length < count) {
    let progressed = false;
    for (const mod of order) {
      if (picked.length >= count) break;
      const next = pools.get(mod)!.shift();
      if (next) {
        picked.push(next);
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  return shuffle(picked, rng);
}

export function buildItems(drawn: QuizQuestion[], rng: Rng = Math.random): AttemptItem[] {
  return drawn.map((q) => ({ qid: q.id, order: shuffle(q.choices.map((_, i) => i), rng) }));
}

export function toClientQuestion(q: QuizQuestion, item: AttemptItem, index: number): ClientQuestion {
  return {
    index,
    moduleTitle: q.moduleTitle,
    persona: q.persona,
    attendee: q.attendee,
    transcript: q.transcript,
    prompt: q.prompt,
    choices: item.order.map((ci) => q.choices[ci].text),
  };
}

/** Index of the correct choice in display order. */
export function correctPos(q: QuizQuestion, item: AttemptItem): number {
  return item.order.findIndex((ci) => q.choices[ci].correct === true);
}

/** Index of the partial-credit ("next best") choice in display order, or -1 when there is none. */
export function partialPos(q: QuizQuestion, item: AttemptItem): number {
  return item.order.findIndex((ci) => q.choices[ci].partial === true);
}

export function computeResult(attempt: QuizAttempt, bank: QuizBank): QuizResult {
  const byId = new Map(bank.questions.map((q) => [q.id, q]));
  const total = attempt.items.length;
  const right = attempt.items.filter((it) => it.correct).length;
  // Partial picks are worth half. Older attempts have no `partial` flag, which counts as none.
  const partial = attempt.items.filter((it) => !it.correct && it.partial === true).length;
  const points = right + partial / 2;
  const percent = total ? Math.round((points / total) * 1000) / 10 : 0;
  const grade = gradeFor(percent);
  const leader =
    bank.leaders.find((l) => l.id === attempt.leaderId) ??
    bank.leaders[0] ?? { id: "", name: "", title: "", portrait: "" };
  const describe = (it: AttemptItem) => {
    const q = byId.get(it.qid);
    const said = q?.attendee ?? q?.transcript?.find((l) => l.who === "attendee")?.text ?? q?.prompt ?? "";
    return { moduleTitle: q?.moduleTitle ?? "", summary: said };
  };
  return {
    right,
    partial,
    points,
    total,
    percent,
    grade,
    passed: percent >= bank.passPercent,
    leader: { id: leader.id, name: leader.name, title: leader.title, line: bank.gradeLines[grade] ?? "" },
    missed: attempt.items.filter((it) => it.correct === false && it.partial !== true).map(describe),
    okay: attempt.items.filter((it) => it.correct === false && it.partial === true).map(describe),
  };
}
