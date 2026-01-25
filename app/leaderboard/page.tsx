"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy, ExternalLink } from "lucide-react";
import { PERSONAS } from "@/lib/personas";
import type { LeaderboardEntry } from "@/lib/leaderboardStore";

type RangeOption = "24h" | "7d" | "30d" | "all";

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function GradeBadge({ grade }: { grade: string }) {
  const styles = {
    A: "bg-green-500/15 text-green-200 border border-green-400/20",
    B: "bg-blue-500/15 text-blue-200 border border-blue-400/20",
    C: "bg-yellow-500/15 text-yellow-200 border border-yellow-400/20",
    D: "bg-orange-500/15 text-orange-200 border border-orange-400/20",
    F: "bg-red-500/15 text-red-200 border border-red-400/20",
  };

  const style = styles[grade as keyof typeof styles] || styles.F;

  return (
    <span className={`px-2 py-1 rounded text-sm font-semibold ${style}`}>
      {grade}
    </span>
  );
}

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeOption>("all");
  const [personaFilter, setPersonaFilter] = useState<string>("");

  useEffect(() => {
    async function loadLeaderboard() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("range", range);
        if (personaFilter) {
          params.set("personaId", personaFilter);
        }

        const response = await fetch(`/api/leaderboard?${params.toString()}`);
        const data = await response.json();
        setEntries(data.entries || []);
      } catch (error) {
        console.error("Failed to load leaderboard:", error);
      } finally {
        setLoading(false);
      }
    }
    loadLeaderboard();
  }, [range, personaFilter]);

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Trophy size={32} className="text-yellow-400" />
          <h1 className="text-3xl font-bold">Leaderboard</h1>
        </div>
        <p className="text-white/70 text-sm">
          Top scores from practice sessions
        </p>
      </div>

      {/* Filters */}
      <div className="rounded-lg border border-white/15 bg-white/7 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-300 font-medium">
              Time Range:
            </label>
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as RangeOption)}
              className="bg-black/30 border border-white/20 text-gray-100 rounded px-3 py-1.5 text-sm outline-none focus:border-white/30"
            >
              <option value="all">All Time</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-300 font-medium">
              Persona:
            </label>
            <select
              value={personaFilter}
              onChange={(e) => setPersonaFilter(e.target.value)}
              className="bg-black/30 border border-white/20 text-gray-100 rounded px-3 py-1.5 text-sm outline-none focus:border-white/30"
            >
              <option value="">All Personas</option>
              {PERSONAS.map((persona) => (
                <option key={persona.id} value={persona.id}>
                  {persona.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Leaderboard Table */}
      {loading ? (
        <div className="rounded-lg border border-white/15 bg-white/7 p-8 shadow-sm text-center">
          <p className="text-gray-400">Loading leaderboard...</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-lg border border-white/15 bg-white/7 p-8 shadow-sm text-center">
          <p className="text-gray-400">
            No scores yet. Complete a practice session to appear on the
            leaderboard!
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-white/15 bg-white/7 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/5 border-b border-white/10">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Rank
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Score
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Grade
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Persona
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Difficulty
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-300 uppercase tracking-wider">
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
                      <td className="px-4 py-3 text-sm text-gray-300 font-semibold">
                        {rankEmoji} {rank}
                      </td>
                      <td className="px-4 py-3 text-lg font-bold text-white">
                        {entry.score}
                      </td>
                      <td className="px-4 py-3">
                        <GradeBadge grade={entry.grade} />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-300">
                        {entry.meta?.personaName || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400 capitalize">
                        {entry.meta?.difficulty || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">
                        {formatDate(entry.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
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
    </div>
  );
}
