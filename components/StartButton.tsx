"use client";

import React, { useEffect, useState } from "react";

/** The one button on /start: asks the server where this signed-in person goes next, then goes. */
export function StartButton({ label = "Start →" }: { label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Back/forward-cache restores would otherwise leave the button stuck on "Starting…".
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setBusy(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/start", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        window.location.assign("/signin?callbackUrl=%2Fstart");
        return;
      }
      if (!res.ok || !data.next) throw new Error(data.error || "Something went wrong. Try again.");
      window.location.assign(data.next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className="rounded-md bg-[#0278cd] hover:bg-[#0066ba] px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Starting…" : label}
      </button>
      {error && <p className="text-sm text-[#e65b53]">{error}</p>}
    </div>
  );
}
