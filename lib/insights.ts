import { ScoreRecord } from "./scoring";

/**
 * Coaching-first insights.
 *
 * The point of this screen is manager coaching, not vanity charts: for each trainee, where they
 * stand and the one thing to work on next; for the team, the biggest shared opportunity and how
 * grades are landing — all phrased as feedback you'd actually share. Every derived field here is
 * meant to become a sentence a manager can say to a person.
 */

const DIMENSIONS = [
  "discovery",
  "listening",
  "empathy",
  "qualification",
  "guardrails",
  "handoff",
] as const;
type Dim = (typeof DIMENSIONS)[number];

const DIM_LABEL: Record<Dim, string> = {
  discovery: "Discovery",
  listening: "Listening",
  empathy: "Empathy",
  qualification: "Qualification & Fit",
  guardrails: "Guardrails",
  handoff: "Next-Step / Handoff",
};

/** One concrete, encouraging "work on this next" line per dimension. */
const DIM_TIP: Record<Dim, string> = {
  discovery: "Dig for impact, not just pain — ask what it costs them when it goes wrong.",
  listening: "Reflect what you heard, in their words, before asking the next question.",
  empathy: "Name the specific frustration you heard so they feel understood.",
  qualification: "Confirm fit, need, and who else decides before treating it as a live opportunity.",
  guardrails: "Hold the pitch and the jargon until the pain and relevance are clear.",
  handoff: "Land a concrete next step — an earned badge scan or a scheduled follow-up — or a clean exit.",
};

export interface DimensionStat {
  dimension: Dim;
  label: string;
  avg: number; // 0-20
}

export interface TraineeSummary {
  traineeId: string;
  traineeNameShort: string;
  sessionsCompleted: number;
  avgScore: number;
  bestScore: number;
  firstScore: number | null;
  latestScore: number | null;
  improvement: number | null; // latestScore - firstScore
  // Coaching
  strength: DimensionStat | null; // strongest dimension
  growthArea: DimensionStat | null; // weakest dimension
  nextStep: string | null; // coaching tip for the growth area
}

export interface ScenarioSummary {
  personaId: string;
  personaDisplayName: string;
  attempts: number;
  avgScore: number;
  bestScore: number;
}

export interface ActivitySummary {
  sessionsCompleted: number;
  avgScore: number;
  topActiveTrainees: Array<{
    traineeId: string;
    traineeNameShort: string;
    count: number;
  }>;
}

export interface TeamCoaching {
  /** The team's weakest dimension on average — the shared coaching priority. */
  weakest: DimensionStat | null;
  strongest: DimensionStat | null;
  tip: string | null; // coaching tip for the weakest dimension
  passRate: number; // % of sessions graded C or better
  gradeDistribution: Record<"A" | "B" | "C" | "D" | "F", number>;
}

export interface InsightsData {
  traineeSummaries: TraineeSummary[];
  scenarioSummaries: ScenarioSummary[];
  activity: ActivitySummary;
  teamCoaching: TeamCoaching;
}

/** Per-dimension average across a set of scores, counting only records that carry each key
 *  (so legacy five-dimension records don't drag the new dimensions to zero). */
function dimensionStats(scores: ScoreRecord[]): DimensionStat[] {
  const stats: DimensionStat[] = [];
  for (const dim of DIMENSIONS) {
    const vals = scores
      .map((s) => (s.breakdown as Record<string, number | undefined>)?.[dim])
      .filter((v): v is number => typeof v === "number");
    if (vals.length === 0) continue;
    stats.push({
      dimension: dim,
      label: DIM_LABEL[dim],
      avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
    });
  }
  return stats;
}

function strongestOf(stats: DimensionStat[]): DimensionStat | null {
  return stats.length ? stats.reduce((a, b) => (b.avg > a.avg ? b : a)) : null;
}
function weakestOf(stats: DimensionStat[]): DimensionStat | null {
  return stats.length ? stats.reduce((a, b) => (b.avg < a.avg ? b : a)) : null;
}

/**
 * Compute insights from score records. Filters are applied before computation.
 */
export function computeInsights(scores: ScoreRecord[]): InsightsData {
  // Group scores by traineeId
  const traineeMap = new Map<string, ScoreRecord[]>();
  for (const score of scores) {
    if (!score.traineeId) continue; // Skip scores without trainee
    const existing = traineeMap.get(score.traineeId) ?? [];
    existing.push(score);
    traineeMap.set(score.traineeId, existing);
  }

  // Compute trainee summaries
  const traineeSummaries: TraineeSummary[] = [];
  for (const [traineeId, traineeScores] of traineeMap.entries()) {
    // Sort by completedAt (oldest first for first/latest)
    const sorted = [...traineeScores].sort(
      (a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime()
    );

    const sessionsCompleted = sorted.length;
    const scoreValues = sorted.map((s) => s.score);
    const avgScore = Math.round(
      scoreValues.reduce((sum, s) => sum + s, 0) / scoreValues.length
    );
    const bestScore = Math.max(...scoreValues);
    const firstScore = sorted[0]?.score ?? null;
    const latestScore = sorted[sorted.length - 1]?.score ?? null;
    const improvement =
      firstScore !== null && latestScore !== null ? latestScore - firstScore : null;

    const dims = dimensionStats(sorted);
    const growthArea = weakestOf(dims);

    traineeSummaries.push({
      traineeId,
      traineeNameShort: sorted[0]?.traineeNameShort ?? "—",
      sessionsCompleted,
      avgScore,
      bestScore,
      firstScore,
      latestScore,
      improvement,
      strength: strongestOf(dims),
      growthArea,
      nextStep: growthArea ? DIM_TIP[growthArea.dimension] : null,
    });
  }

  // Sort trainee summaries by sessions completed (desc)
  traineeSummaries.sort((a, b) => b.sessionsCompleted - a.sessionsCompleted);

  // Group scores by persona
  const scenarioMap = new Map<string, ScoreRecord[]>();
  for (const score of scores) {
    if (!score.personaId) continue; // Skip incomplete data
    const key = score.personaId;
    const existing = scenarioMap.get(key) ?? [];
    existing.push(score);
    scenarioMap.set(key, existing);
  }

  // Compute scenario summaries
  const scenarioSummaries: ScenarioSummary[] = [];
  for (const [, scenarioScores] of scenarioMap.entries()) {
    const attempts = scenarioScores.length;
    const scoreValues = scenarioScores.map((s) => s.score);
    const avgScore = Math.round(
      scoreValues.reduce((sum, s) => sum + s, 0) / scoreValues.length
    );
    const bestScore = Math.max(...scoreValues);

    scenarioSummaries.push({
      personaId: scenarioScores[0].personaId ?? "",
      personaDisplayName: scenarioScores[0].personaDisplayName ?? "—",
      attempts,
      avgScore,
      bestScore,
    });
  }

  // Sort scenario summaries by attempts (desc)
  scenarioSummaries.sort((a, b) => b.attempts - a.attempts);

  // Activity summary
  const sessionsCompleted = scores.length;
  const avgScore =
    scores.length > 0
      ? Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length)
      : 0;

  const traineeActivity = Array.from(traineeMap.entries())
    .map(([traineeId, traineeScores]) => ({
      traineeId,
      traineeNameShort: traineeScores[0]?.traineeNameShort ?? "—",
      count: traineeScores.length,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Team coaching: shared weakest/strongest dimension + grade mix + pass rate.
  const teamDims = dimensionStats(scores);
  const weakest = weakestOf(teamDims);
  const gradeDistribution: Record<"A" | "B" | "C" | "D" | "F", number> = {
    A: 0,
    B: 0,
    C: 0,
    D: 0,
    F: 0,
  };
  for (const s of scores) {
    if (s.grade in gradeDistribution) gradeDistribution[s.grade] += 1;
  }
  const passing = gradeDistribution.A + gradeDistribution.B + gradeDistribution.C;
  const passRate = scores.length > 0 ? Math.round((passing / scores.length) * 100) : 0;

  return {
    traineeSummaries,
    scenarioSummaries,
    activity: {
      sessionsCompleted,
      avgScore,
      topActiveTrainees: traineeActivity,
    },
    teamCoaching: {
      weakest,
      strongest: strongestOf(teamDims),
      tip: weakest ? DIM_TIP[weakest.dimension] : null,
      passRate,
      gradeDistribution,
    },
  };
}
