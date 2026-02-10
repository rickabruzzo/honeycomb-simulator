"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import type { AdminInviteRow } from "../../lib/adminInvites";
import type { Persona } from "../../lib/scenarioTypes";
import type { Trainee } from "../../lib/traineeStore";
import { ExternalLink, Copy, Eye } from "lucide-react";

function StatusBadge({ status }: { status: AdminInviteRow["status"] }) {
  const styles = {
    NOT_STARTED:
      "bg-white/10 text-white/70 border border-white/10 px-2 py-1 rounded text-xs font-medium",
    IN_PROGRESS:
      "bg-sky-500/15 text-sky-200 border border-sky-400/20 px-2 py-1 rounded text-xs font-medium",
    COMPLETED:
      "bg-emerald-500/15 text-emerald-200 border border-emerald-400/20 px-2 py-1 rounded text-xs font-medium",
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

function TokenDisplay({ token }: { token: string }) {
  const [copied, setCopied] = React.useState(false);
  const short = `${token.slice(0, 8)}…`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <code className="text-xs text-gray-400 font-mono">{short}</code>
      <button
        onClick={handleCopy}
        className={`text-xs px-1.5 py-0.5 rounded transition ${
          copied
            ? "bg-emerald-500/20 text-emerald-200"
            : "bg-white/5 hover:bg-white/10 text-gray-400"
        }`}
      >
        {copied ? "✓" : "Copy"}
      </button>
    </div>
  );
}

function CopyUrlButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      const fullUrl = `${window.location.origin}${url}`;
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded transition ${
        copied
          ? "bg-emerald-500/20 text-emerald-200"
          : "bg-white/10 hover:bg-white/15 text-gray-300"
      }`}
    >
      {copied ? (
        <>✓ Copied</>
      ) : (
        <>
          <Copy size={12} /> Copy URL
        </>
      )}
    </button>
  );
}

function CopyTokenButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded transition ${
        copied
          ? "bg-emerald-500/20 text-emerald-200"
          : "bg-white/10 hover:bg-white/15 text-gray-300"
      }`}
      title="Copy token"
    >
      {copied ? (
        <>✓</>
      ) : (
        <>
          <Copy size={12} /> Token
        </>
      )}
    </button>
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
      <div>
        <h1 className="text-2xl font-semibold">Scenario Tracker</h1>
        <p className="text-white/70 text-sm">
          Track training sessions, filter by persona/trainee, and view scores
        </p>
      </div>

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
                    Created
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
                    className="hover:bg-white/5 transition"
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
                        <span className="font-medium">
                          {invite.score}
                          {invite.grade && (
                            <span className="text-gray-400 ml-1">/ {invite.grade}</span>
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-400">
                      {formatDate(invite.createdAt)}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-400">
                      {formatRelativeTime(invite.lastActivityAt)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={invite.traineeUrl}
                          target="_blank"
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-[#51368D] hover:bg-[#431E80] text-white transition"
                        >
                          <ExternalLink size={12} /> Trainee
                        </Link>
                        {invite.shareUrl ? (
                          <Link
                            href={invite.shareUrl}
                            target="_blank"
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-[#64BA00] hover:bg-[#4CA600] text-gray-950 transition"
                          >
                            <ExternalLink size={12} /> Score
                          </Link>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-white/5 text-gray-500 cursor-not-allowed">
                            <ExternalLink size={12} /> Score
                          </span>
                        )}
                        <Link
                          href={`/review/${invite.token}`}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-cyan-700/50 hover:bg-cyan-600/50 text-white transition"
                        >
                          <Eye size={12} /> Review
                        </Link>
                        <CopyUrlButton url={invite.traineeUrl} />
                        <CopyTokenButton token={invite.token} />
                      </div>
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
