"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Award, TrendingUp, AlertCircle, Home, Trophy, Eye } from "lucide-react";
import { BrandButton } from "../../../components/ui/BrandButton";
import Link from "next/link";

interface ScoreRecord {
  token: string;
  sessionId: string;
  personaId?: string;
  difficulty?: string;
  conferenceContext?: string;
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  breakdown: {
    listening: number;
    discovery: number;
    empathy: number;
    otel_assumptions: number;
    guardrails: number;
  };
  highlights: string[];
  mistakes: string[];
  violations: string[];
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
              <p className="text-white/70 mb-6">
                Complete a practice session first to see your scorecard.
              </p>
              <BrandButton
                onClick={() => router.push("/")}
                variant="lime"
                className="w-full justify-center"
              >
                <Home size={16} /> Practice Now
              </BrandButton>
            </div>
          </div>
        </div>
    );
  }

  const gradeColor = {
    A: "text-green-400",
    B: "text-blue-400",
    C: "text-yellow-400",
    D: "text-orange-400",
    F: "text-red-400",
  }[scoreRecord.grade];

  const gradeBackground = {
    A: "bg-green-900/30 border-green-700",
    B: "bg-blue-900/30 border-blue-700",
    C: "bg-yellow-900/30 border-yellow-700",
    D: "bg-orange-900/30 border-orange-700",
    F: "bg-red-900/30 border-red-700",
  }[scoreRecord.grade];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-2">Session Scorecard</h1>
          <p className="text-gray-400 text-sm">
            {scoreRecord.conferenceContext || "Practice Session"}
          </p>
          {scoreRecord.difficulty && (
            <p className="text-gray-500 text-xs mt-1">
              Difficulty: {scoreRecord.difficulty}
            </p>
          )}
        </div>

        {/* Score Card */}
        <div
          className={`rounded-lg border-2 p-8 text-center ${gradeBackground}`}
        >
          <div className="flex items-center justify-center gap-4 mb-4">
            <Award size={48} className={gradeColor} />
            <div>
              <div className={`text-6xl font-bold ${gradeColor}`}>
                {scoreRecord.grade}
              </div>
              <div className="text-2xl text-gray-300 mt-2">
                {scoreRecord.score}/100
              </div>
            </div>
          </div>
        </div>

        {/* Breakdown */}
        <div className="rounded-lg border border-white/15 bg-white/7 p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <TrendingUp size={20} /> Score Breakdown
          </h2>
          <div className="space-y-3">
            {Object.entries(scoreRecord.breakdown).map(([key, value]) => {
              const label = key
                .replace(/_/g, " ")
                .replace(/\b\w/g, (c) => c.toUpperCase());
              const percentage = (value / 20) * 100;
              return (
                <div key={key}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-300">{label}</span>
                    <span className="text-gray-400">
                      {value}/20
                    </span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-indigo-500 h-2 rounded-full transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
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
          {scoreRecord.inviteToken && (
            <Link href={`/review/${scoreRecord.inviteToken}`}>
              <BrandButton
                variant="cobalt"
                className="px-6 py-3"
              >
                <Eye size={16} /> Review Session
              </BrandButton>
            </Link>
          )}
          <BrandButton
            onClick={() => router.push("/leaderboard")}
            variant="indigo"
            className="px-6 py-3"
          >
            <Trophy size={16} /> View Leaderboard
          </BrandButton>
          <BrandButton
            onClick={() => router.push("/")}
            variant="lime"
            className="px-6 py-3"
          >
            <Home size={16} /> Practice Again
          </BrandButton>
        </div>

        {/* Footer */}
        <div className="text-center text-gray-500 text-xs">
          Session completed: {new Date(scoreRecord.completedAt).toLocaleString()}
        </div>
      </div>
  );
}
