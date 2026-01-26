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
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-lg border border-white/15 bg-white/7 p-4 shadow-sm">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
                Total Sessions
              </p>
              <p className="text-3xl font-bold text-white">
                {insights.activity.sessionsCompleted}
              </p>
            </div>

            <div className="rounded-lg border border-white/15 bg-white/7 p-4 shadow-sm">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
                Average Score
              </p>
              <p className="text-3xl font-bold text-white">
                {insights.activity.avgScore}
              </p>
            </div>

            <div className="rounded-lg border border-white/15 bg-white/7 p-4 shadow-sm">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
                Active Trainees
              </p>
              <p className="text-3xl font-bold text-white">
                {insights.activity.topActiveTrainees.length}
              </p>
            </div>
          </div>

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
                                ? "text-green-400"
                                : trainee.improvement < 0
                                  ? "text-red-400"
                                  : "text-gray-400"
                          }`}
                        >
                          {trainee.improvement === null
                            ? "—"
                            : trainee.improvement > 0
                              ? `+${trainee.improvement}`
                              : trainee.improvement}
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
                        key={`${scenario.conferenceId}-${scenario.personaId}-${idx}`}
                        className="hover:bg-white/5 transition"
                      >
                        <td className="px-3 py-3 text-sm text-gray-300">
                          {scenario.conferenceName}
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
