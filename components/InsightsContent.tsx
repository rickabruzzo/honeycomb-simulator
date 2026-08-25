"use client";

import React, { useEffect, useState } from "react";
import type { Conference, Persona } from "@/lib/scenarioTypes";
import type { Trainee } from "@/lib/traineeStore";
import { formatTraineeShort } from "@/lib/traineeStore";
import type {
  InsightsData,
  TraineeSummary,
  ScenarioSummary,
} from "@/lib/insights";

type RangeOption = "7d" | "30d" | "all";

// Brand grade colors + threshold, shared by the average-score tile and the grade-distribution bar.
const GRADE_HEX: Record<"A" | "B" | "C" | "D" | "F", string> = {
  A: "#64ba00",
  B: "#0298ec",
  C: "#ffb000",
  D: "#f96e10",
  F: "#e65b53",
};
const GRADES = ["A", "B", "C", "D", "F"] as const;
function gradeFor(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A";
  if (score >= 78) return "B";
  if (score >= 65) return "C";
  if (score >= 50) return "D";
  return "F";
}

export function InsightsContent() {
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [trainees, setTrainees] = useState<Trainee[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{
    totalScores: number;
    filteredScores: number;
    range: string;
  } | null>(null);

  // Filter state
  const [range, setRange] = useState<RangeOption>("7d");
  const [conferenceFilter, setConferenceFilter] = useState<string>("");
  const [personaFilter, setPersonaFilter] = useState<string>("");
  const [traineeFilter, setTraineeFilter] = useState<string>("");

  // Load conferences, personas, and trainees for filters
  useEffect(() => {
    async function loadFilterData() {
      try {
        const [confRes, personaRes, traineeRes] = await Promise.all([
          fetch("/api/conferences"),
          fetch("/api/personas"),
          fetch("/api/trainees"),
        ]);

        if (confRes.ok) {
          const confData = await confRes.json();
          setConferences(confData.conferences || []);
        }

        if (personaRes.ok) {
          const personaData = await personaRes.json();
          setPersonas(personaData.personas || []);
        }

        if (traineeRes.ok) {
          const traineeData = await traineeRes.json();
          setTrainees(traineeData.trainees || []);
        }
      } catch (error) {
        console.error("Failed to load filter data:", error);
      }
    }
    loadFilterData();
  }, []);

  // Load insights
  useEffect(() => {
    async function loadInsights() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("range", range);
        if (conferenceFilter) {
          params.set("conferenceId", conferenceFilter);
        }
        if (personaFilter) {
          params.set("personaId", personaFilter);
        }
        if (traineeFilter) {
          params.set("traineeId", traineeFilter);
        }

        const response = await fetch(`/api/insights?${params.toString()}`);
        const data = await response.json();
        setInsights(data.insights || null);
        setStats({
          totalScores: data.totalScores || 0,
          filteredScores: data.filteredScores || 0,
          range: data.range || range,
        });
      } catch (error) {
        console.error("Failed to load insights:", error);
      } finally {
        setLoading(false);
      }
    }
    loadInsights();
  }, [range, conferenceFilter, personaFilter, traineeFilter]);

  return (
    <>
      {/* Filters */}
      <div className="rounded-lg border border-white/15 bg-white/7 p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Time Range
            </label>
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as RangeOption)}
              className="w-full bg-black/30 border border-white/20 text-gray-100 rounded px-2 py-1.5 text-sm outline-none focus:border-white/30"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="all">All time</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Conference
            </label>
            <select
              value={conferenceFilter}
              onChange={(e) => setConferenceFilter(e.target.value)}
              className="w-full bg-black/30 border border-white/20 text-gray-100 rounded px-2 py-1.5 text-sm outline-none focus:border-white/30"
            >
              <option value="">All conferences</option>
              {conferences.map((conf) => (
                <option key={conf.id} value={conf.id}>
                  {conf.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Persona</label>
            <select
              value={personaFilter}
              onChange={(e) => setPersonaFilter(e.target.value)}
              className="w-full bg-black/30 border border-white/20 text-gray-100 rounded px-2 py-1.5 text-sm outline-none focus:border-white/30"
            >
              <option value="">All personas</option>
              {personas.map((persona) => (
                <option key={persona.id} value={persona.id}>
                  {persona.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Trainee</label>
            <select
              value={traineeFilter}
              onChange={(e) => setTraineeFilter(e.target.value)}
              className="w-full bg-black/30 border border-white/20 text-gray-100 rounded px-2 py-1.5 text-sm outline-none focus:border-white/30"
            >
              <option value="">All trainees</option>
              {trainees.map((trainee) => (
                <option key={trainee.id} value={trainee.id}>
                  {formatTraineeShort(trainee)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {stats && (
          <p className="text-xs text-gray-400 mt-3">
            Analyzing {stats.filteredScores} of {stats.totalScores} total
            sessions
          </p>
        )}
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="rounded-lg border border-white/15 bg-white/7 p-8 shadow-sm text-center">
          <p className="text-gray-400">Loading insights...</p>
        </div>
      ) : !insights ? (
        <div className="rounded-lg border border-white/15 bg-white/7 p-8 shadow-sm text-center">
          <p className="text-gray-400">No insights data available.</p>
        </div>
      ) : (
        <>
          {/* Team coaching — the shareable takeaway, words first */}
          {insights.teamCoaching?.weakest && (
            <div
              className="rounded-lg border p-5 shadow-sm"
              style={{ borderColor: "rgba(2,152,236,0.3)", background: "rgba(2,152,236,0.06)" }}
            >
              <h2 className="text-base font-semibold mb-1" style={{ color: "#0298ec" }}>
                Team coaching
              </h2>
              <p className="text-sm text-gray-200 leading-relaxed">
                The team&apos;s biggest opportunity right now is{" "}
                <strong className="text-white">{insights.teamCoaching.weakest.label}</strong>
                {insights.teamCoaching.strongest &&
                  insights.teamCoaching.strongest.dimension !== insights.teamCoaching.weakest.dimension && (
                    <>
                      {" "}— while <strong className="text-white">{insights.teamCoaching.strongest.label}</strong> is a shared strength
                    </>
                  )}
                . {insights.teamCoaching.tip}
              </p>
            </div>
          )}

          {/* Summary tiles — consistent style; grade distribution gets a real mini-bar */}
          {(() => {
            const gd = insights.teamCoaching?.gradeDistribution;
            const passRate = insights.teamCoaching?.passRate ?? 0;
            const total = gd ? GRADES.reduce((s, g) => s + gd[g], 0) : 0;
            const avg = insights.activity.avgScore;
            const avgGrade = gradeFor(avg);
            const tile = "rounded-lg border border-white/15 bg-white/7 p-4 shadow-sm";
            const capLabel = "text-[11px] text-gray-400 uppercase tracking-wider mb-2";
            const stat = "font-display text-3xl font-bold leading-none";
            return (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className={tile}>
                  <p className={capLabel}>Sessions</p>
                  <p className={`${stat} text-white`}>{insights.activity.sessionsCompleted}</p>
                </div>

                <div className={tile}>
                  <p className={capLabel}>Average score</p>
                  <div className="flex items-baseline gap-2">
                    <span className={stat} style={{ color: GRADE_HEX[avgGrade] }}>{avg}</span>
                    <span
                      className="text-xs font-semibold rounded px-1.5 py-0.5"
                      style={{ background: GRADE_HEX[avgGrade], color: avgGrade === "C" ? "#25303e" : "#fff" }}
                    >
                      {avgGrade}
                    </span>
                  </div>
                </div>

                <div className={tile}>
                  <p className={capLabel}>Pass rate (C+)</p>
                  <p className={stat} style={{ color: "#64ba00" }}>{passRate}%</p>
                </div>

                <div className={tile}>
                  <p className={capLabel}>Grades</p>
                  {total > 0 && gd ? (
                    <>
                      <div className="flex h-3 rounded-sm overflow-hidden my-1.5">
                        {GRADES.map((g) =>
                          gd[g] > 0 ? (
                            <span key={g} style={{ width: `${(gd[g] / total) * 100}%`, background: GRADE_HEX[g] }} />
                          ) : null
                        )}
                      </div>
                      <div className="flex gap-2.5 text-[11px] text-gray-400">
                        {GRADES.map((g) => (
                          <span key={g}>
                            <span style={{ color: GRADE_HEX[g] }}>{g}</span> {gd[g]}
                          </span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className={`${stat} text-white/40`}>—</p>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Trainee Performance Table */}
          <div className="rounded-lg border border-white/15 bg-white/7 shadow-sm overflow-hidden">
            <div className="bg-white/5 border-b border-white/10 px-4 py-3">
              <h2 className="text-lg font-semibold text-white">
                Trainee Performance
              </h2>
              <p className="text-xs text-gray-400">
                Individual trainee statistics
              </p>
            </div>
            <div className="overflow-x-auto">
              {insights.traineeSummaries.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  No trainee data available for selected filters.
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-white/5 border-b border-white/10">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                        Trainee
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                        Sessions
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                        Avg Score
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                        Best Score
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                        First Score
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                        Latest Score
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                        Improvement
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                        Work on next
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {insights.traineeSummaries.map((trainee) => (
                      <tr
                        key={trainee.traineeId}
                        className="hover:bg-white/5 transition"
                      >
                        <td className="px-3 py-3 text-sm text-gray-300">
                          {trainee.traineeNameShort}
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-300 font-semibold">
                          {trainee.sessionsCompleted}
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-300">
                          {trainee.avgScore}
                        </td>
                        <td className="px-3 py-3 text-sm text-white font-semibold">
                          {trainee.bestScore}
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-300">
                          {trainee.firstScore ?? "—"}
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-300">
                          {trainee.latestScore ?? "—"}
                        </td>
                        <td
                          className={`px-3 py-3 text-sm font-semibold ${
                            trainee.improvement === null
                              ? "text-gray-400"
                              : trainee.improvement > 0
                                ? "text-[#64ba00]"
                                : trainee.improvement < 0
                                  ? "text-[#e65b53]"
                                  : "text-gray-400"
                          }`}
                        >
                          {trainee.improvement === null
                            ? "—"
                            : trainee.improvement > 0
                              ? `+${trainee.improvement}`
                              : trainee.improvement}
                        </td>
                        <td className="px-3 py-3 align-top" style={{ minWidth: 220, maxWidth: 300 }}>
                          {trainee.growthArea ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-sm font-medium" style={{ color: "#f96e10" }}>
                                {trainee.growthArea.label}
                              </span>
                              {trainee.nextStep && (
                                <span className="text-xs text-gray-400 leading-snug">{trainee.nextStep}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-sm text-gray-500">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Scenario Performance Table */}
          <div className="rounded-lg border border-white/15 bg-white/7 shadow-sm overflow-hidden">
            <div className="bg-white/5 border-b border-white/10 px-4 py-3">
              <h2 className="text-lg font-semibold text-white">
                Scenario Performance
              </h2>
              <p className="text-xs text-gray-400">
                Performance by conference and persona
              </p>
            </div>
            <div className="overflow-x-auto">
              {insights.scenarioSummaries.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  No scenario data available for selected filters.
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-white/5 border-b border-white/10">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                        Conference
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                        Persona
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                        Attempts
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                        Avg Score
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                        Best Score
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {insights.scenarioSummaries.map((scenario, idx) => (
                      <tr
                        key={`${scenario.personaId}-${idx}`}
                        className="hover:bg-white/5 transition"
                      >
                        <td className="px-3 py-3 text-sm text-gray-300">
                          {scenario.personaDisplayName}
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-300">
                          <div
                            className="max-w-[180px] truncate"
                            title={scenario.personaDisplayName}
                          >
                            {scenario.personaDisplayName}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-300 font-semibold">
                          {scenario.attempts}
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-300">
                          {scenario.avgScore}
                        </td>
                        <td className="px-3 py-3 text-sm text-white font-semibold">
                          {scenario.bestScore}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
