"use client";

import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Copy, ExternalLink, Trash2, Check } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import type { AttemptSummary, QuizRecord } from "@/lib/quiz/types";
import { siteUrl } from "@/lib/siteUrl";

/**
 * Quiz Results: send trainees their personal study-guide quiz link and track how they do. The
 * quiz is separate from scenario building; passing it (a C or better) unlocks the simulator.
 */

type Row = QuizRecord & { passed: boolean };
interface TraineeOpt {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
}

const GRADE_HEX: Record<string, string> = { A: "#64ba00", B: "#0298ec", C: "#ffb000", D: "#f96e10", F: "#e65b53" };
const HEX = "polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)";

function GradeChip({ grade }: { grade: string }) {
  const fg = grade === "A" || grade === "C" ? "#25303e" : "#fff";
  return (
    <span
      className="inline-flex items-center justify-center font-display text-[11px] font-bold"
      style={{ width: 22, height: 25, clipPath: HEX, background: GRADE_HEX[grade] ?? "#e65b53", color: fg }}
    >
      {grade}
    </span>
  );
}

function fmtDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " · " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function best(attempts: AttemptSummary[]): AttemptSummary | null {
  return attempts.reduce<AttemptSummary | null>((b, a) => (!b || a.percent > b.percent ? a : b), null);
}

function topMissed(attempts: AttemptSummary[]): string | null {
  const counts = new Map<string, number>();
  for (const a of attempts) for (const m of a.missedModules) counts.set(m, (counts.get(m) ?? 0) + 1);
  let top: string | null = null;
  let n = 0;
  for (const [m, c] of counts) if (c > n) { top = m; n = c; }
  return top;
}

function quizUrl(token: string) {
  return typeof window === "undefined" ? `/q/${token}` : `${window.location.origin}/q/${token}`;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
      className="rounded p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
    >
      {done ? <Check size={15} className="text-[#64ba00]" /> : <Copy size={15} />}
    </button>
  );
}

export default function QuizResultsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [trainees, setTrainees] = useState<TraineeOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [traineeId, setTraineeId] = useState("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ name: string; url: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  // The generic link is absolute on the client only (siteUrl falls back to window.origin), so
  // read it after hydration to keep the server and client markup identical.
  const startUrl = useSyncExternalStore(() => () => {}, () => siteUrl("/start"), () => "");

  const load = useCallback(async () => {
    try {
      const [r, t] = await Promise.all([fetch("/api/quiz-links"), fetch("/api/trainees?include=email")]);
      const rd = await r.json();
      const td = await t.json();
      setRows(rd.records ?? []);
      setTrainees(td.trainees ?? []);
      setError(null);
    } catch (e) {
      console.error(e);
      setError("Couldn't load quiz results.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createLink = async () => {
    if (!traineeId) return;
    setCreating(true);
    try {
      const res = await fetch("/api/quiz-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ traineeId }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const link = await res.json();
      setCreated({ name: link.traineeName, url: quizUrl(link.token) });
      setTraineeId("");
      await load();
    } catch (e) {
      console.error(e);
      setError("Couldn't create the quiz link.");
    } finally {
      setCreating(false);
    }
  };

  const remove = async (row: Row) => {
    if (!confirm(`Delete ${row.traineeName}'s quiz link and all their quiz results? They'll need to pass again before practicing.`)) return;
    setDeleting(row.traineeId);
    try {
      await fetch(`/api/quiz-links/${row.traineeId}`, { method: "DELETE" });
      setRows((rs) => rs.filter((r) => r.traineeId !== row.traineeId));
    } finally {
      setDeleting(null);
    }
  };

  const stats = useMemo(() => {
    const attempted = rows.filter((r) => r.attempts.length);
    const passed = rows.filter((r) => r.passed).length;
    const attempts = rows.reduce((n, r) => n + r.attempts.length, 0);
    const bests = attempted.map((r) => best(r.attempts)!.percent);
    const avgBest = bests.length ? Math.round(bests.reduce((a, b) => a + b, 0) / bests.length) : null;
    const misses = new Map<string, number>();
    for (const r of rows) for (const a of r.attempts) for (const m of a.missedModules) misses.set(m, (misses.get(m) ?? 0) + 1);
    const struggle = [...misses.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    return { linked: rows.length, passed, attempts, avgBest, struggle };
  }, [rows]);

  const linkedIds = new Set(rows.map((r) => r.traineeId));
  const emailById = new Map(trainees.map((t) => [t.id, t.email]));
  const options = [...trainees].sort((a, b) =>
    `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Quiz Results"
        subtitle="Send trainees their booth study-guide quiz and track how they do. Passing (a C or better) unlocks the simulator."
      />

      <section className="rounded-xl border border-white/15 bg-white/7 p-5 flex flex-col gap-3">
        <h2 className="font-display text-sm font-semibold text-white">Send a quiz link</h2>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={traineeId}
            onChange={(e) => setTraineeId(e.target.value)}
            className="min-w-[260px] flex-1 rounded-md border border-white/20 bg-black/30 px-3 py-2.5 text-sm text-gray-100 outline-none focus:border-white/30"
          >
            <option value="">Select a trainee…</option>
            {options.map((t) => (
              <option key={t.id} value={t.id}>
                {t.firstName} {t.lastName}
                {linkedIds.has(t.id) ? " (has a link)" : ""}
              </option>
            ))}
          </select>
          <button
            onClick={createLink}
            disabled={!traineeId || creating}
            className="rounded-md bg-[#0278cd] hover:bg-[#0066ba] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {creating ? "Creating…" : "Get quiz link"}
          </button>
        </div>
        <p className="text-xs text-white/45">
          One link per trainee; asking again returns the same link. Trainees who open a practice link before passing are
          pointed to theirs automatically.
        </p>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm">
          <span className="text-white/70">Or share the generic link. Anyone picks their name or adds themselves, then quiz → simulator:</span>
          <code className="truncate text-white/85">{startUrl || "…"}</code>
          {startUrl && <CopyButton text={startUrl} label="Copy generic link" />}
        </div>
        {created && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#64ba00]/30 bg-[#64ba00]/10 px-3 py-2 text-sm">
            <span className="text-[#9ede5a]">Quiz link for {created.name}:</span>
            <code className="truncate text-white/85">{created.url}</code>
            <CopyButton text={created.url} label="Copy quiz link" />
          </div>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Trainees with a link", String(stats.linked)],
          ["Passed", `${stats.passed}${stats.linked ? ` of ${stats.linked}` : ""}`],
          ["Attempts", String(stats.attempts)],
          ["Average best score", stats.avgBest === null ? "—" : `${stats.avgBest}%`],
        ].map(([l, n]) => (
          <div key={l} className="rounded-xl border border-white/15 bg-white/7 p-4">
            <div className="font-display text-2xl font-semibold text-white tabular-nums">{n}</div>
            <div className="text-xs text-white/55">{l}</div>
          </div>
        ))}
      </div>

      {stats.struggle.length > 0 && (
        <div className="rounded-xl border border-white/15 bg-white/7 px-5 py-4 text-sm">
          <span className="text-white/55">Most-missed modules: </span>
          {stats.struggle.map(([m, n], i) => (
            <span key={m} className="text-white">
              {i > 0 && <span className="text-white/30"> · </span>}
              {m} <span className="text-white/45">({n})</span>
            </span>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-[#e65b53]">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-white/15 bg-white/7">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wide text-white/45">
              <th className="px-4 py-3 font-semibold">Trainee</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Best</th>
              <th className="px-4 py-3 font-semibold">Last attempt</th>
              <th className="px-4 py-3 font-semibold">Attempts</th>
              <th className="px-4 py-3 font-semibold">Misses most</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-white/45">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-white/45">No quiz links yet. Send one above.</td></tr>
            ) : (
              rows.map((r) => {
                const b = best(r.attempts);
                const last = r.attempts[0];
                const url = quizUrl(r.quizToken);
                return (
                  <tr key={r.traineeId} className="group border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">{r.traineeName}</div>
                      {emailById.get(r.traineeId) && (
                        <div className="text-xs text-white/45">{emailById.get(r.traineeId)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.passed ? (
                        <span className="rounded-full border border-[#64ba00]/40 px-2.5 py-0.5 text-xs font-semibold text-[#9ede5a]">Passed</span>
                      ) : r.attempts.length ? (
                        <span className="rounded-full border border-[#ffb000]/40 px-2.5 py-0.5 text-xs font-semibold text-[#ffd27a]">Not yet</span>
                      ) : (
                        <span className="rounded-full border border-white/20 px-2.5 py-0.5 text-xs font-semibold text-white/50">Not started</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {b ? (
                        <span className="inline-flex items-center gap-2">
                          <GradeChip grade={b.grade} />
                          <span className="tabular-nums text-white/80">{b.right}/{b.total}</span>
                        </span>
                      ) : (
                        <span className="text-white/35">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-white/70">
                      {last ? (
                        <span className="inline-flex items-center gap-2">
                          <GradeChip grade={last.grade} />
                          <span>{fmtDate(last.completedAt)}</span>
                        </span>
                      ) : (
                        <span className="text-white/35">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-white/70">{r.attempts.length}</td>
                    <td className="px-4 py-3 text-white/70">{topMissed(r.attempts) ?? <span className="text-white/35">—</span>}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100">
                        <CopyButton text={url} label="Copy quiz link" />
                        <a href={url} target="_blank" rel="noreferrer" title="Open quiz" aria-label="Open quiz" className="rounded p-1.5 text-white/60 hover:bg-white/10 hover:text-white">
                          <ExternalLink size={15} />
                        </a>
                        <button
                          type="button"
                          onClick={() => remove(r)}
                          disabled={deleting === r.traineeId}
                          title="Delete link and results"
                          aria-label="Delete link and results"
                          className="rounded p-1.5 text-[#e65b53]/80 hover:bg-[#e65b53]/10 hover:text-[#e65b53] disabled:opacity-40"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
