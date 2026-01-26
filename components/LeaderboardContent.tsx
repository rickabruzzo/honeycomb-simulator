"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy, ExternalLink, Play } from "lucide-react";
import type { LeaderboardEntry } from "@/lib/leaderboardStore";
import type { Conference, Persona } from "@/lib/scenarioTypes";
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

export function LeaderboardContent() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [conferences, setConferences] = useState<Conference[]>([]);
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

  // Load leaderboard entries
  useEffect(() => {
    async function loadLeaderboard() {
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
  }, [range, conferenceFilter, personaFilter, traineeFilter]);

  return (
    <>
      {/* Filters */}
      <div className="rounded-lg border border-white/15 bg-white/7 p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
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
            <label className="block text-xs text-gray-400 mb-1">Conference</label>
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
        <div className="rounded-lg border border-white/15 bg-white/7 p-8 shadow-sm text-center space-y-4">
          <p className="text-gray-400">
            {stats && stats.totalStored === 0
              ? "No scores yet. Be the first to complete a practice session!"
              : "No scores match the selected filters."}
          </p>
          <Link href="/">
            <BrandButton variant="lime" className="inline-flex items-center gap-2">
              <Play size={16} /> Practice Now
            </BrandButton>
          </Link>
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
                    Conference
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
                        {entry.traineeNameShort || "—"}
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-300">
                        {entry.conferenceName || "—"}
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
