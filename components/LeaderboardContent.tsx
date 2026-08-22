"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy, ExternalLink } from "lucide-react";
import type { LeaderboardEntry } from "@/lib/leaderboardStore";
import type { Persona } from "@/lib/scenarioTypes";
import type { Trainee } from "@/lib/traineeStore";
import { formatTraineeShort } from "@/lib/traineeStore";
import { BrandButton } from "@/components/ui/BrandButton";

type RangeOption = "24h" | "7d" | "30d" | "all";

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Honeycomb-motif grade badge: a brand-colored hexagon (lime/pacific/honey/tango/red).
function GradeBadge({ grade }: { grade: string }) {
  const gradeHex =
    { A: "#64ba00", B: "#0298ec", C: "#ffb000", D: "#f96e10", F: "#e65b53" }[
      grade as "A" | "B" | "C" | "D" | "F"
    ] ?? "#e65b53";
  return (
    <span
      className="inline-flex items-center justify-center font-display font-bold text-xs"
      style={{
        width: 26,
        height: 29,
        clipPath: "polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)",
        background: gradeHex,
        color: grade === "C" ? "#25303e" : "#ffffff",
      }}
    >
      {grade}
    </span>
  );
}

export function LeaderboardContent() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [trainees, setTrainees] = useState<Trainee[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{
    totalMatched: number;
    totalStored: number;
    rangeUsed: string;
    limitUsed: number;
  } | null>(null);

  // Filter state
  const [range, setRange] = useState<RangeOption>("7d"); // Default to 7 days
  const [personaFilter, setPersonaFilter] = useState<string>("");
  const [traineeFilter, setTraineeFilter] = useState<string>("");

  // Load personas and trainees for filters
  useEffect(() => {
    async function loadFilterData() {
      try {
        const [personaRes, traineeRes] = await Promise.all([
          fetch("/api/personas"),
          fetch("/api/trainees"),
        ]);

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

  // Load leaderboard entries
  useEffect(() => {
    async function loadLeaderboard() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("range", range);
        if (personaFilter) {
          params.set("personaId", personaFilter);
        }
        if (traineeFilter) {
          params.set("traineeId", traineeFilter);
        }

        const response = await fetch(`/api/leaderboard?${params.toString()}`);
        const data = await response.json();
        setEntries(data.entries || []);
        setStats({
          totalMatched: data.totalMatched || 0,
          totalStored: data.totalStored || 0,
          rangeUsed: data.rangeUsed || range,
          limitUsed: data.limitUsed || 20,
        });
      } catch (error) {
        console.error("Failed to load leaderboard:", error);
      } finally {
        setLoading(false);
      }
    }
    loadLeaderboard();
  }, [range, personaFilter, traineeFilter]);

  return (
    <>
      {/* Filters */}
      <div className="rounded-lg border border-white/15 bg-white/7 p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Time Range</label>
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as RangeOption)}
              className="w-full bg-black/30 border border-white/20 text-gray-100 rounded px-2 py-1.5 text-sm outline-none focus:border-white/30"
            >
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="all">All time</option>
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
            Showing top {entries.length} of {stats.totalMatched} matching entries
            {stats.totalStored > stats.totalMatched && (
              <span> (filtered from {stats.totalStored} total)</span>
            )}
          </p>
        )}
      </div>

      {/* Leaderboard Table */}
      {loading ? (
        <div className="rounded-lg border border-white/15 bg-white/7 p-8 shadow-sm text-center">
          <p className="text-gray-400">Loading leaderboard...</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-lg border border-white/15 bg-white/7 p-8 shadow-sm text-center">
          <p className="text-gray-400">
            {stats && stats.totalStored === 0
              ? "No scores yet — completed practice sessions will show up here."
              : "No scores match the selected filters."}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-white/15 bg-white/7 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/5 border-b border-white/10">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Rank
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Score
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Grade
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Trainee
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Persona
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Scorecard
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {entries.map((entry, idx) => {
                  const rank = idx + 1;
                  const rankEmoji =
                    rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "";

                  return (
                    <tr
                      key={entry.token}
                      className="hover:bg-white/5 transition"
                    >
                      <td className="px-3 py-3 text-sm text-gray-300 font-semibold">
                        {rankEmoji} {rank}
                      </td>
                      <td className="px-3 py-3 text-lg font-bold text-white">
                        {entry.score}
                      </td>
                      <td className="px-3 py-3">
                        <GradeBadge grade={entry.grade} />
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-300">
                        <span className="inline-flex items-center gap-2">
                          {entry.traineeNameShort || "—"}
                          {entry.trainingWheels && (
                            <span
                              className="text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5"
                              style={{ color: "#ffb000", background: "rgba(255,176,0,0.12)", border: "1px solid rgba(255,176,0,0.3)" }}
                              title="Assisted — run with training wheels"
                            >
                              assisted
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-300">
                        <div className="max-w-[180px] truncate" title={entry.personaDisplayName || undefined}>
                          {entry.personaDisplayName || "—"}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-400">
                        {formatDate(entry.createdAt)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Link
                          href={`/share/${entry.token}`}
                          target="_blank"
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-[#51368D] hover:bg-[#431E80] text-white transition"
                        >
                          <ExternalLink size={12} /> View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
