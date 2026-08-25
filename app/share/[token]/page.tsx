"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { TrendingUp, AlertCircle, Trophy } from "lucide-react";
import { BrandButton } from "../../../components/ui/BrandButton";

interface ScoreRecord {
  token: string;
  sessionId: string;
  personaId?: string;
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  breakdown: {
    discovery: number;
    listening: number;
    empathy: number;
    qualification: number;
    guardrails: number;
    handoff: number;
  };
  highlights: string[];
  mistakes: string[];
  violations: string[];
  evidence?: {
    dimension: string;
    attendeeQuote?: string;
    quote: string;
    comment: string;
  }[];
  scoringMethod?: "judge" | "heuristic";
  trainingWheels?: boolean;
  createdAt: string;
  completedAt: string;
  inviteToken?: string | null;
}

export default function ShareScorePage() {
  const params = useParams();
  const router = useRouter();
  const token = params?.token as string;

  const [scoreRecord, setScoreRecord] = useState<ScoreRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Invalid share link");
      setLoading(false);
      return;
    }

    const fetchScore = async () => {
      try {
        const res = await fetch(`/api/share/${token}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          setError(errData.error || "Score not found");
          return;
        }

        const data = await res.json();
        setScoreRecord(data);
      } catch (e) {
        console.error("Failed to load score:", e);
        setError("Failed to load score");
      } finally {
        setLoading(false);
      }
    };

    fetchScore();
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center">
        <div className="text-gray-400">Loading score...</div>
      </div>
    );
  }

  if (error || !scoreRecord) {
    return (
      <div className="flex items-center justify-center">
          <div className="max-w-md">
            <div className="rounded-lg border border-white/15 bg-white/7 p-8 shadow-sm text-center">
              <div className="text-5xl mb-4">📊</div>
              <h1 className="text-2xl font-semibold mb-3">No score yet</h1>
              <p className="text-white/70">
                This scorecard will be ready once the practice session is complete.
              </p>
            </div>
          </div>
        </div>
    );
  }

  // Brand grade colors (Honeycomb palette): A lime, B pacific, C honey, D tango, F red.
  const gradeHex =
    { A: "#64BA00", B: "#0298EC", C: "#FFB000", D: "#F96E10", F: "#E65B53" }[
      scoreRecord.grade
    ] ?? "#0298EC";
  const HEX_CLIP = "polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-2">Session Scorecard</h1>
          <p className="text-gray-400 text-sm">
            Practice Session
          </p>
          {scoreRecord.trainingWheels && (
            <div className="mt-3 flex justify-center">
              <span
                className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide rounded-full px-3 py-1"
                style={{ color: "#ffb000", background: "rgba(255,176,0,0.12)", border: "1px solid rgba(255,176,0,0.35)" }}
              >
                Assisted · training wheels
              </span>
            </div>
          )}
        </div>

        {/* Grade hero — hexagon badge (Honeycomb motif) */}
        <div
          className="rounded-2xl border p-8 flex items-center justify-center"
          style={{ borderColor: `${gradeHex}55`, background: `${gradeHex}14` }}
        >
          <div
            style={{
              width: 108,
              height: 120,
              clipPath: HEX_CLIP,
              background: gradeHex,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 88,
                height: 98,
                clipPath: HEX_CLIP,
                background: "#25303e",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
              }}
            >
              <div
                className="font-display font-bold leading-none"
                style={{ fontSize: 44, color: gradeHex }}
              >
                {scoreRecord.grade}
              </div>
              <div className="text-xs text-white/60">
                {scoreRecord.score}/100
              </div>
            </div>
          </div>
        </div>

        {/* Breakdown */}
        <div className="rounded-lg border border-white/15 bg-white/7 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <TrendingUp size={20} /> Score Breakdown
            </h2>
            {scoreRecord.scoringMethod && (
              <span className="text-[11px] text-gray-500 uppercase tracking-wide">
                {scoreRecord.scoringMethod === "judge"
                  ? "AI-evaluated"
                  : "Auto-scored"}
              </span>
            )}
          </div>
          <div className="space-y-3">
            {Object.entries(scoreRecord.breakdown).map(([key, value]) => {
              // Display names that don't fall out of the key nicely; every other key
              // (including old five-key records) keeps the Title-Case derivation.
              const LABELS: Record<string, string> = {
                qualification: "Qualification & Fit",
                handoff: "Next-Step / Handoff",
              };
              const label =
                LABELS[key] ??
                key
                  .replace(/_/g, " ")
                  .replace(/\b\w/g, (c) => c.toUpperCase());
              const percentage = Math.min(100, (value / 10) * 100);
              // Brand tint by strength: strong=lime, mid=honey, weak=tango.
              const barColor =
                percentage >= 80 ? "#64ba00" : percentage >= 55 ? "#ffb000" : "#f96e10";
              const ev = scoreRecord.evidence?.find((e) => e.dimension === key);
              return (
                <div key={key}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-300">{label}</span>
                    <span className="text-gray-400">
                      {value}/10
                    </span>
                  </div>
                  <div className="w-full rounded-full h-2" style={{ background: "rgba(255,255,255,0.10)" }}>
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{ width: `${percentage}%`, background: barColor }}
                    />
                  </div>
                  {ev && (ev.comment || ev.quote || ev.attendeeQuote) && (
                    <div className="mt-2 mb-1 pl-3 border-l-2 border-white/15 space-y-1">
                      {ev.comment && (
                        <p className="text-xs text-gray-400">{ev.comment}</p>
                      )}
                      {ev.attendeeQuote && (
                        <p className="text-xs text-gray-300 mt-0.5">
                          <span className="text-gray-500">Attendee:</span>{" "}
                          <span className="italic">&ldquo;{ev.attendeeQuote}&rdquo;</span>
                        </p>
                      )}
                      {ev.quote && (
                        <p className="text-xs text-gray-300">
                          <span className="text-gray-500">You:</span>{" "}
                          <span className="italic">&ldquo;{ev.quote}&rdquo;</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Highlights */}
        {scoreRecord.highlights.length > 0 && (
          <div className="rounded-lg border border-white/15 bg-white/7 p-6 shadow-sm">
            <h2 className="text-xl font-semibold mb-4 text-green-400">
              ✅ What You Did Well
            </h2>
            <ul className="space-y-2">
              {scoreRecord.highlights.map((highlight, idx) => (
                <li key={idx} className="text-gray-300 flex items-start gap-2">
                  <span className="text-green-400 mt-1">•</span>
                  <span>{highlight}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Mistakes */}
        {scoreRecord.mistakes.length > 0 && (
          <div className="rounded-lg border border-white/15 bg-white/7 p-6 shadow-sm">
            <h2 className="text-xl font-semibold mb-4 text-orange-400 flex items-center gap-2">
              <AlertCircle size={20} /> Areas for Improvement
            </h2>
            <ul className="space-y-2">
              {scoreRecord.mistakes.map((mistake, idx) => (
                <li key={idx} className="text-gray-300 flex items-start gap-2">
                  <span className="text-orange-400 mt-1">•</span>
                  <span>{mistake}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Guardrail Violations */}
        {scoreRecord.violations && scoreRecord.violations.length > 0 && (
          <div className="rounded-lg border border-red-500/30 bg-red-900/10 p-6 shadow-sm">
            <h2 className="text-xl font-semibold mb-4 text-red-400 flex items-center gap-2">
              <AlertCircle size={20} /> Guardrail Violations
            </h2>
            <ul className="space-y-2">
              {scoreRecord.violations.map((violation, idx) => (
                <li key={idx} className="text-gray-300 flex items-start gap-2">
                  <span className="text-red-400 mt-1">•</span>
                  <span>{violation}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <BrandButton
            onClick={() => router.push("/leaderboard/share")}
            variant="indigo"
            className="px-6 py-3"
          >
            <Trophy size={16} /> View Leaderboard
          </BrandButton>
        </div>

        {/* Footer */}
        <div className="text-center text-gray-500 text-xs">
          Session completed: {new Date(scoreRecord.completedAt).toLocaleString()}
        </div>
      </div>
  );
}
