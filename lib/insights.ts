import { ScoreRecord } from "./scoring";

export interface TraineeSummary {
  traineeId: string;
  traineeNameShort: string;
  sessionsCompleted: number;
  avgScore: number;
  bestScore: number;
  firstScore: number | null;
  latestScore: number | null;
  improvement: number | null; // latestScore - firstScore
}

export interface ScenarioSummary {
  conferenceId: string;
  conferenceName: string;
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

export interface InsightsData {
  traineeSummaries: TraineeSummary[];
  scenarioSummaries: ScenarioSummary[];
  activity: ActivitySummary;
}

/**
 * Compute insights from score records
 * Filters are applied before computation
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
    const sorted = [...traineeScores].sort((a, b) =>
      new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime()
    );

    const sessionsCompleted = sorted.length;
    const scores = sorted.map((s) => s.score);
    const avgScore = Math.round(
      scores.reduce((sum, s) => sum + s, 0) / scores.length
    );
    const bestScore = Math.max(...scores);
    const firstScore = sorted[0]?.score ?? null;
    const latestScore = sorted[sorted.length - 1]?.score ?? null;
    const improvement =
      firstScore !== null && latestScore !== null
        ? latestScore - firstScore
        : null;

    traineeSummaries.push({
      traineeId,
      traineeNameShort: sorted[0]?.traineeNameShort ?? "—",
      sessionsCompleted,
      avgScore,
      bestScore,
      firstScore,
      latestScore,
      improvement,
    });
  }

  // Sort trainee summaries by sessions completed (desc)
  traineeSummaries.sort((a, b) => b.sessionsCompleted - a.sessionsCompleted);

  // Group scores by conference+persona
  const scenarioMap = new Map<string, ScoreRecord[]>();
  for (const score of scores) {
    if (!score.conferenceId || !score.personaId) continue; // Skip incomplete data
    const key = `${score.conferenceId}::${score.personaId}`;
    const existing = scenarioMap.get(key) ?? [];
    existing.push(score);
    scenarioMap.set(key, existing);
  }

  // Compute scenario summaries
  const scenarioSummaries: ScenarioSummary[] = [];
  for (const [key, scenarioScores] of scenarioMap.entries()) {
    const attempts = scenarioScores.length;
    const scores = scenarioScores.map((s) => s.score);
    const avgScore = Math.round(
      scores.reduce((sum, s) => sum + s, 0) / scores.length
    );
    const bestScore = Math.max(...scores);

    scenarioSummaries.push({
      conferenceId: scenarioScores[0].conferenceId ?? "",
      conferenceName: scenarioScores[0].conferenceName ?? "—",
      personaId: scenarioScores[0].personaId ?? "",
      personaDisplayName: scenarioScores[0].personaDisplayName ?? "—",
      attempts,
      avgScore,
      bestScore,
    });
  }

  // Sort scenario summaries by attempts (desc)
  scenarioSummaries.sort((a, b) => b.attempts - a.attempts);

  // Compute activity summary
  const sessionsCompleted = scores.length;
  const avgScore =
    scores.length > 0
      ? Math.round(
          scores.reduce((sum, s) => sum + s.score, 0) / scores.length
        )
      : 0;

  // Top active trainees (by count in this filtered set)
  const traineeActivity = Array.from(traineeMap.entries())
    .map(([traineeId, traineeScores]) => ({
      traineeId,
      traineeNameShort: traineeScores[0]?.traineeNameShort ?? "—",
      count: traineeScores.length,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    traineeSummaries,
    scenarioSummaries,
    activity: {
      sessionsCompleted,
      avgScore,
      topActiveTrainees: traineeActivity,
    },
  };
}
