"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { MessageSquare, Clock, User, Home } from "lucide-react";
import { BrandButton } from "@/components/ui/BrandButton";

interface TranscriptMessage {
  id: string;
  type: "system" | "trainee" | "attendee";
  text: string;
  timestamp: string;
}

interface ReviewData {
  token: string;
  sessionId: string;
  kickoff: {
    conferenceContext?: string;
    difficulty?: string;
    personaId?: string;
    conferenceId?: string;
    conferenceName?: string;
    personaDisplayName?: string;
    traineeId?: string;
    traineeNameShort?: string;
  };
  transcript: TranscriptMessage[];
  currentState: string;
  violations: string[];
  active: boolean;
  startTime: string;
}

function formatTimestamp(isoString: string): string {
  return new Date(isoString).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function MessageBubble({ message }: { message: TranscriptMessage }) {
  const isTrainee = message.type === "trainee";
  const isSystem = message.type === "system";
  const isAttendee = message.type === "attendee";

  const bgColor = isTrainee
    ? "bg-indigo-900/30 border-indigo-700/50"
    : isSystem
      ? "bg-gray-800/50 border-gray-700/50"
      : "bg-purple-900/30 border-purple-700/50";

  const label = isTrainee ? "You" : isSystem ? "System" : "Attendee";
  const labelColor = isTrainee
    ? "text-indigo-300"
    : isSystem
      ? "text-gray-400"
      : "text-purple-300";

  return (
    <div className={`rounded-lg border p-4 ${bgColor}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <User size={14} className={labelColor} />
          <span className={`text-xs font-semibold ${labelColor}`}>{label}</span>
        </div>
        <span className="text-xs text-gray-500">
          {formatTimestamp(message.timestamp)}
        </span>
      </div>
      <p className="text-sm text-gray-300 whitespace-pre-wrap">{message.text}</p>
    </div>
  );
}

export default function ReviewPage() {
  const params = useParams();
  const router = useRouter();
  const token = params?.token as string;

  const [reviewData, setReviewData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Invalid review link");
      setLoading(false);
      return;
    }

    const fetchReview = async () => {
      try {
        const res = await fetch(`/api/review/${token}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          setError(errData.error || "Session not found");
          return;
        }

        const data = await res.json();
        setReviewData(data);
      } catch (e) {
        console.error("Failed to load review:", e);
        setError("Failed to load session");
      } finally {
        setLoading(false);
      }
    };

    fetchReview();
  }, [token]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="rounded-lg border border-white/15 bg-white/7 p-8 shadow-sm text-center">
          <p className="text-gray-400">Loading session...</p>
        </div>
      </div>
    );
  }

  if (error || !reviewData) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="rounded-lg border border-white/15 bg-white/7 p-8 shadow-sm text-center space-y-4">
          <div className="text-5xl mb-4">🔍</div>
          <h1 className="text-2xl font-semibold mb-3">Session Not Found</h1>
          <p className="text-white/70 mb-6">
            {error || "This session could not be found or has been removed."}
          </p>
          <BrandButton
            onClick={() => router.push("/admin")}
            variant="indigo"
            className="inline-flex items-center gap-2"
          >
            <Home size={16} /> Back to Tracker
          </BrandButton>
        </div>
      </div>
    );
  }

  const hasTranscript = reviewData.transcript.length > 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="rounded-lg border border-white/15 bg-white/7 p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <MessageSquare size={28} className="text-[#64BA00]" />
            <div>
              <h1 className="text-2xl font-bold">Session Review</h1>
              <p className="text-xs text-gray-400 mt-1">
                Read-only transcript view for trainers
              </p>
            </div>
          </div>
          <BrandButton
            onClick={() => router.push("/admin")}
            variant="indigo"
            className="text-sm"
          >
            <Home size={14} /> Back to Tracker
          </BrandButton>
        </div>
      </div>

      {/* Session Metadata */}
      <div className="rounded-lg border border-white/15 bg-white/7 p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Session Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
              Conference
            </p>
            <p className="text-sm text-gray-300">
              {reviewData.kickoff.conferenceName ||
                reviewData.kickoff.conferenceContext ||
                reviewData.kickoff.conferenceId ||
                "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
              Persona
            </p>
            <p className="text-sm text-gray-300">
              {reviewData.kickoff.personaDisplayName ||
                reviewData.kickoff.personaId ||
                "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
              Trainee
            </p>
            <p className="text-sm text-gray-300">
              {reviewData.kickoff.traineeNameShort ||
                reviewData.kickoff.traineeId ||
                "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
              Difficulty
            </p>
            <p className="text-sm text-gray-300 capitalize">
              {reviewData.kickoff.difficulty || "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
              Started
            </p>
            <p className="text-sm text-gray-300 flex items-center gap-1">
              <Clock size={14} />
              {formatTimestamp(reviewData.startTime)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
              Status
            </p>
            <p className="text-sm text-gray-300">
              {reviewData.active ? (
                <span className="px-2 py-1 rounded text-xs font-medium bg-sky-500/15 text-sky-200 border border-sky-400/20">
                  In Progress
                </span>
              ) : (
                <span className="px-2 py-1 rounded text-xs font-medium bg-emerald-500/15 text-emerald-200 border border-emerald-400/20">
                  Completed
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Transcript */}
      <div className="rounded-lg border border-white/15 bg-white/7 p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <MessageSquare size={20} /> Conversation Transcript
        </h2>

        {!hasTranscript ? (
          <div className="text-center py-8">
            <p className="text-gray-400 text-sm">
              No messages yet. The trainee has not started the conversation.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {reviewData.transcript.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </div>
        )}
      </div>

      {/* Violations (if any) */}
      {reviewData.violations.length > 0 && (
        <div className="rounded-lg border border-red-500/30 bg-red-900/10 p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4 text-red-400">
            ⚠️ Guardrail Violations
          </h2>
          <ul className="space-y-2">
            {reviewData.violations.map((violation, idx) => (
              <li key={idx} className="text-sm text-gray-300 flex items-start gap-2">
                <span className="text-red-400 mt-1">•</span>
                <span>{violation}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer */}
      <div className="text-center text-gray-500 text-xs">
        Session ID: {reviewData.sessionId}
      </div>
    </div>
  );
}
