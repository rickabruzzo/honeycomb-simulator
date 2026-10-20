"use client";

import React, { useEffect, useState, useSyncExternalStore } from "react";
import { useParams } from "next/navigation";
import { QuizFlow } from "@/components/quiz/QuizFlow";
import type { QuizSource } from "@/lib/quiz/types";

/**
 * A trainee's personal quiz link. Separate from practice links: passing here (a C or better)
 * unlocks the simulator on every practice link for this trainee.
 */
interface Status {
  available: boolean;
  traineeName?: string;
  passed: boolean;
  questionsPerAttempt?: number;
  passPercent?: number;
  sources?: QuizSource[];
}

export default function QuizPage() {
  const params = useParams();
  const token = params?.token as string;
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  // When they arrive from a practice link (?from=<invite token>), send them back after they pass.
  const search = useSyncExternalStore(() => () => {}, () => window.location.search, () => "");
  const fromParam = new URLSearchParams(search).get("from");
  const from = fromParam && /^[A-Za-z0-9-]+$/.test(fromParam) ? fromParam : null;

  useEffect(() => {
    fetch(`/api/quiz/${token}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "This quiz link isn't valid." : "Couldn't load the quiz.");
        return r.json();
      })
      .then(setStatus)
      .catch((e) => setError(e.message));
  }, [token]);

  if (error) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="mb-3 font-display text-2xl font-semibold text-white">Quiz unavailable</h1>
        <p className="text-sm text-[#e65b53]">{error}</p>
        <p className="mt-2 text-sm text-white/50">Ask whoever sent you this link for a new one.</p>
      </div>
    );
  }
  if (!status) return <div className="py-20 text-center text-gray-500">Loading…</div>;
  if (!status.available) {
    return (
      <div className="mx-auto max-w-md py-20 text-center text-sm text-white/60">
        The quiz isn&apos;t available right now. Check back soon.
      </div>
    );
  }
  return <QuizFlow token={token} status={status} continueHref={from ? `/s/${from}` : null} />;
}
