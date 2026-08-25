"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import type { AdminInviteRow } from "../../lib/adminInvites";
import type { Persona } from "../../lib/scenarioTypes";
import type { Trainee } from "../../lib/traineeStore";
import { ExternalLink, Copy, Eye } from "lucide-react";
import { siteUrl } from "../../lib/siteUrl";
import { PageHeader } from "../../components/PageHeader";

function StatusBadge({ status }: { status: AdminInviteRow["status"] }) {
  // Brand status pills: neutral / Pacific in-progress / Lime completed.
  const styles = {
    NOT_STARTED:
      "bg-white/[0.06] text-white/70 border border-white/15 px-2.5 py-1 rounded-full text-xs font-medium",
    IN_PROGRESS:
      "bg-[#0298ec]/15 text-[#7cc6f2] border border-[#0298ec]/35 px-2.5 py-1 rounded-full text-xs font-medium",
    COMPLETED:
      "bg-[#64ba00]/15 text-[#9ede5a] border border-[#64ba00]/35 px-2.5 py-1 rounded-full text-xs font-medium",
  };

  const labels = {
    NOT_STARTED: "Not Started",
    IN_PROGRESS: "In Progress",
    COMPLETED: "Completed",
  };

  return <span className={styles[status]}>{labels[status]}</span>;
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return "—";

  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

// Grade hex + label, consistent with the Insights / Leaderboard grade chips.
const GRADE_HEX: Record<"A" | "B" | "C" | "D" | "F", string> = {
  A: "#64ba00",
  B: "#0298ec",
  C: "#ffb000",
  D: "#f96e10",
  F: "#e65b53",
};

/** Small hexagon grade badge matching the Insights/Leaderboard chips. */
function GradeChip({ grade }: { grade: string }) {
  const g = (["A", "B", "C", "D", "F"].includes(grade) ? grade : "F") as
    | "A" | "B" | "C" | "D" | "F";
  const hex = GRADE_HEX[g];
  // Amber/lime chips read better with a dark glyph; darker chips take white.
  const fg = g === "A" || g === "C" ? "#25303e" : "#fff";
  return (
    <span
      className="inline-flex items-center justify-center font-display text-[11px] font-bold"
      style={{
        width: 22,
        height: 25,
        clipPath: "polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)",
        background: hex,
        color: fg,
      }}
      aria-label={`Grade ${g}`}
    >
      {g}
    </span>
  );
}

/**
 * Row actions, redesigned to one accent: a persistent ghost "Review" pill (the primary
 * admin action) plus open-session and copy-link icon buttons that reveal on row hover.
 * Replaces the old five saturated buttons per row.
 */
function RowActions({
  reviewUrl,
  traineeUrl,
  reviewable,
}: {
  reviewUrl: string;
  traineeUrl: string;
  reviewable: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(siteUrl(traineeUrl));
    } catch {
      /* clipboard may be blocked; still flash confirmation */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-center justify-end gap-1.5">
      {reviewable ? (
        <Link
          href={reviewUrl}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/[0.07] px-3 py-1.5 text-xs font-medium text-gray-100 transition hover:border-[#0298ec]/45 hover:bg-[#0278cd]/25 hover:text-white"
        >
          <Eye size={13} /> Review
        </Link>
      ) : (
        <span
          className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-gray-500"
          title="No session to review yet"
        >
          <Eye size={13} /> Review
        </span>
      )}
      <div className="flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Link
          href={traineeUrl}
          target="_blank"
          title="Open session"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/12 bg-white/[0.06] text-gray-300 transition hover:border-[#0298ec]/45 hover:bg-[#0278cd]/25 hover:text-white"
        >
          <ExternalLink size={13} />
        </Link>
        <button
          onClick={copyLink}
          title="Copy trainee link"
          className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition ${
            copied
              ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-200"
              : "border-white/12 bg-white/[0.06] text-gray-300 hover:border-[#0298ec]/45 hover:bg-[#0278cd]/25 hover:text-white"
          }`}
        >
          {copied ? "✓" : <Copy size={13} />}
        </button>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [invites, setInvites] = useState<AdminInviteRow[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [trainees, setTrainees] = useState<Trainee[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filter state
  const [filterPersonaId, setFilterPersonaId] = useState<string>("");
  const [filterTraineeId, setFilterTraineeId] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterTimeRange, setFilterTimeRange] = useState<string>("7d");

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [invitesRes, personasRes, traineesRes] = await Promise.all([
        fetch("/api/admin/invites", { cache: 'no-store' }),
        fetch("/api/personas", { cache: 'no-store' }),
        fetch("/api/trainees", { cache: 'no-store' }),
      ]);

      if (invitesRes.ok) {
        const invitesData = await invitesRes.json();
        setInvites(Array.isArray(invitesData) ? invitesData : []);
      } else {
        console.error("Failed to load invites:", invitesRes.status, invitesRes.statusText);
        setLoadError("Failed to load invites");
      }

      if (personasRes.ok) {
        const personaData = await personasRes.json();
        setPersonas(personaData.personas || []);
      }

      if (traineesRes.ok) {
        const traineeData = await traineesRes.json();
        setTrainees(traineeData.trainees || []);
      }
    } catch (error) {
      console.error("Failed to load data:", error);
      setLoadError(error instanceof Error ? error.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Apply filters
  const filteredInvites = useMemo(() => {
    let filtered = [...invites];

    // Time range filter
    if (filterTimeRange !== "all") {
      const now = Date.now();
      const ranges: Record<string, number> = {
        "24h": 24 * 60 * 60 * 1000,
        "7d": 7 * 24 * 60 * 60 * 1000,
        "30d": 30 * 24 * 60 * 60 * 1000,
      };
      const cutoff = now - ranges[filterTimeRange];
      filtered = filtered.filter(
        (inv) => new Date(inv.createdAt).getTime() >= cutoff
      );
    }

    // Persona filter
    if (filterPersonaId) {
      filtered = filtered.filter((inv) => inv.personaId === filterPersonaId);
    }

    // Trainee filter
    if (filterTraineeId) {
      filtered = filtered.filter((inv) => inv.traineeId === filterTraineeId);
    }

    // Status filter
    if (filterStatus) {
      filtered = filtered.filter((inv) => inv.status === filterStatus);
    }

    // Sort by createdAt desc
    filtered.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return filtered.slice(0, 200);
  }, [invites, filterPersonaId, filterTraineeId, filterStatus, filterTimeRange]);

  return (
    <div className="max-w-[1400px] mx-auto space-y-4">
      {/* Header */}
      <PageHeader
        title="Scenario Tracker"
        subtitle="Every practice session, its status, and its score. Create new sessions in the Scenario Builder."
      />

      {/* Filter Bar */}
      <div className="rounded-lg border border-white/15 bg-white/7 p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Persona</label>
            <select
              value={filterPersonaId}
              onChange={(e) => setFilterPersonaId(e.target.value)}
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
              value={filterTraineeId}
              onChange={(e) => setFilterTraineeId(e.target.value)}
              className="w-full bg-black/30 border border-white/20 text-gray-100 rounded px-2 py-1.5 text-sm outline-none focus:border-white/30"
            >
              <option value="">All trainees</option>
              {trainees.map((trainee) => (
                <option key={trainee.id} value={trainee.id}>
                  {trainee.firstName} {trainee.lastName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full bg-black/30 border border-white/20 text-gray-100 rounded px-2 py-1.5 text-sm outline-none focus:border-white/30"
            >
              <option value="">All</option>
              <option value="NOT_STARTED">Not Started</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Time Range</label>
            <select
              value={filterTimeRange}
              onChange={(e) => setFilterTimeRange(e.target.value)}
              className="w-full bg-black/30 border border-white/20 text-gray-100 rounded px-2 py-1.5 text-sm outline-none focus:border-white/30"
            >
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="all">All time</option>
            </select>
          </div>
        </div>

        {filteredInvites.length < invites.length && (
          <p className="text-xs text-gray-400 mt-3">
            Showing {filteredInvites.length} of {invites.length} invites
            {filteredInvites.length === 200 && invites.length > 200 && " (limited to 200 most recent)"}
          </p>
        )}
      </div>

      {/* Invites Table */}
      {loading ? (
        <div className="rounded-lg border border-white/15 bg-white/7 p-8 shadow-sm text-center">
          <p className="text-gray-400">Loading invites...</p>
        </div>
      ) : loadError ? (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-8 shadow-sm text-center">
          <p className="text-red-400 mb-4">{loadError}</p>
          <button
            onClick={loadData}
            className="px-4 py-2 rounded bg-red-500/20 text-red-200 hover:bg-red-500/30 transition"
          >
            Retry
          </button>
        </div>
      ) : filteredInvites.length === 0 ? (
        <div className="rounded-lg border border-white/15 bg-white/7 p-8 shadow-sm text-center">
          <p className="text-gray-400">
            {invites.length === 0
              ? "No invites yet. Create one from the Scenario Builder."
              : "No invites match the selected filters."}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-white/15 bg-white/7 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/5 border-b border-white/10">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Trainee
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Persona
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Score
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Last Activity
                  </th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredInvites.map((invite) => (
                  <tr
                    key={invite.token}
                    className="group hover:bg-white/5 transition"
                  >
                    <td className="px-3 py-3 text-sm text-gray-300">
                      {invite.traineeShortName || "—"}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-300">
                      <div className="max-w-[180px] truncate" title={invite.personaDisplayName || undefined}>
                        {invite.personaDisplayName || "—"}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={invite.status} />
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-300">
                      {invite.score !== null ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="font-semibold">{invite.score}</span>
                          {invite.grade && <GradeChip grade={invite.grade} />}
                        </span>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-400" title={formatDate(invite.createdAt)}>
                      {formatRelativeTime(invite.lastActivityAt)}
                    </td>
                    <td className="px-3 py-3">
                      <RowActions
                        reviewUrl={`/review/${invite.token}`}
                        traineeUrl={invite.traineeUrl}
                        reviewable={invite.status !== "NOT_STARTED"}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
