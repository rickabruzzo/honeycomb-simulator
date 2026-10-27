"use client";

import React, { useEffect, useMemo, useState } from "react";

/**
 * The generic booth-training link. Anyone with it picks their name (or adds themselves), then
 * follows the same order as everyone else: the study-guide quiz first, and after a C or better,
 * a practice session against a random attendee. The server (/api/start) decides where they go.
 */

interface Opt {
  id: string;
  firstName: string;
  lastName: string;
}

const MAX_SHOWN = 8;
const fullName = (t: Opt) => `${t.firstName} ${t.lastName}`.trim();
const inputClass =
  "w-full rounded-md border border-white/20 bg-black/30 px-3 py-2.5 text-sm text-gray-100 outline-none placeholder:text-white/35 focus:border-[#0298ec]";

export default function StartPage() {
  const [trainees, setTrainees] = useState<Opt[] | null>(null);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null); // which action is in flight
  const [error, setError] = useState<string | null>(null);
  const [exists, setExists] = useState<Opt | null>(null);

  useEffect(() => {
    fetch("/api/start/trainees")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setTrainees(d?.trainees ?? []))
      .catch(() => setTrainees([]));
  }, []);

  const matches = useMemo(() => {
    if (!trainees) return [];
    const needle = query.trim().toLowerCase();
    return needle ? trainees.filter((t) => fullName(t).toLowerCase().includes(needle)) : trainees;
  }, [trainees, query]);

  const go = async (body: Record<string, string>, key: string) => {
    setBusy(key);
    setError(null);
    setExists(null);
    try {
      const res = await fetch("/api/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.trainee) {
        setExists(data.trainee);
        return;
      }
      if (!res.ok || !data.next) throw new Error(data.error || "Something went wrong. Try again.");
      window.location.assign(data.next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      setBusy(null);
    }
  };

  const submitAdd = (e: React.FormEvent) => {
    e.preventDefault();
    go({ firstName: first.trim(), lastName: last.trim(), email: email.trim() }, "add");
  };

  return (
    <div className="min-h-screen flex items-start sm:items-center justify-center px-4 py-8">
      <div className="w-full max-w-xl rounded-2xl border border-white/15 bg-white/7 p-6 sm:p-7 shadow-sm flex flex-col gap-5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/40">Booth training</span>
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-2xl font-semibold text-white">Who are you?</h1>
          <p className="text-sm leading-relaxed text-white/65">
            Pick your name to get started. You&apos;ll take the booth quiz first (a C or better unlocks the simulator),
            then practice a conversation with a simulated attendee.
          </p>
        </div>

        {exists && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#ffb000]/30 bg-[#ffb000]/8 px-3.5 py-3 text-sm">
            <span className="text-[#ffd27a]">Looks like you&apos;re already here as {fullName(exists)}.</span>
            <button
              type="button"
              onClick={() => go({ traineeId: exists.id }, `pick-${exists.id}`)}
              disabled={busy !== null}
              className="rounded-md bg-[#0278cd] hover:bg-[#0066ba] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Continue as {exists.firstName} →
            </button>
          </div>
        )}

        {!adding ? (
          <div className="flex flex-col gap-3">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type your name…"
              aria-label="Find your name"
              className={inputClass}
            />
            {trainees === null ? (
              <p className="text-sm text-white/45">Loading names…</p>
            ) : matches.length === 0 ? (
              <p className="text-sm text-white/55">
                {trainees.length === 0 ? "No one's been added yet." : "No one by that name yet."} Add yourself below.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {matches.slice(0, MAX_SHOWN).map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => go({ traineeId: t.id }, `pick-${t.id}`)}
                      disabled={busy !== null}
                      className="flex w-full items-center justify-between rounded-lg border border-white/15 bg-black/20 px-3.5 py-2.5 text-left text-sm text-white hover:border-[#0298ec] disabled:opacity-50"
                    >
                      <span>{fullName(t)}</span>
                      <span className="text-white/40">{busy === `pick-${t.id}` ? "Starting…" : "That's me →"}</span>
                    </button>
                  </li>
                ))}
                {matches.length > MAX_SHOWN && (
                  <li className="px-1 pt-1 text-xs text-white/45">
                    Keep typing to narrow it down ({matches.length} names).
                  </li>
                )}
              </ul>
            )}
            <button
              type="button"
              onClick={() => { setAdding(true); setExists(null); setError(null); }}
              className="self-start text-sm font-medium text-[#7cc6f2] underline decoration-[#7cc6f2]/50 underline-offset-4 hover:text-white"
            >
              Not in the list? Add yourself →
            </button>
          </div>
        ) : (
          <form onSubmit={submitAdd} className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input autoFocus required value={first} onChange={(e) => setFirst(e.target.value)} placeholder="First name" aria-label="First name" className={inputClass} />
              <input required value={last} onChange={(e) => setLast(e.target.value)} placeholder="Last name" aria-label="Last name" className={inputClass} />
            </div>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Work email" aria-label="Work email" className={inputClass} />
            <p className="text-xs text-white/45">Your email is only used by your trainer. Nothing is sent to it.</p>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button type="button" onClick={() => setAdding(false)} className="text-sm text-white/60 hover:text-white">
                ← Back to the list
              </button>
              <button
                type="submit"
                disabled={busy !== null}
                className="rounded-md bg-[#0278cd] hover:bg-[#0066ba] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy === "add" ? "Starting…" : "Start →"}
              </button>
            </div>
          </form>
        )}

        {error && <p className="text-sm text-[#e65b53]">{error}</p>}
      </div>
    </div>
  );
}
