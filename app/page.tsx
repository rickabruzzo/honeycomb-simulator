"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Send, Play, Square, ChevronDown, ChevronUp } from "lucide-react";
import { BrandButton } from "../components/ui/BrandButton";
import type { Conference, Persona } from "../lib/scenarioTypes";
import { normalizeTranscript, type TranscriptMessage } from "../lib/normalizeTranscript";
import type { Trainee } from "../lib/traineeStore";
import { formatTraineeFull } from "../lib/traineeStore";

type Message = TranscriptMessage;

const SESSION_STORAGE_KEY = "honeycomb_simulator_session_id";

function formatTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function HoneycombSimulator() {
  const searchParams = useSearchParams();

  // Session state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentState, setCurrentState] = useState("ICEBREAKER");
  const [loading, setLoading] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [violations, setViolations] = useState<string[]>([]);

  // Selection state
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [trainees, setTrainees] = useState<Trainee[]>([]);
  const [selectedConferenceId, setSelectedConferenceId] = useState<string>("");
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>("");
  const [selectedTraineeId, setSelectedTraineeId] = useState<string>("");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [dataLoading, setDataLoading] = useState(true);
  const [dataRefreshing, setDataRefreshing] = useState(false);

  // Invite state
  const [inviteUrl, setInviteUrl] = useState<string>("");
  const [inviteToken, setInviteToken] = useState<string>("");
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string>("");
  const [copied, setCopied] = useState(false);

  // Enrichment status
  const [enrichmentProvider, setEnrichmentProvider] = useState<"openai" | "mock" | null>(null);
  const [enrichmentStatus, setEnrichmentStatus] = useState<"fresh" | "cached" | "none">("none");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const didLoadBootstrap = useRef(false);
  const active = Boolean(sessionId);

  const difficultyLabel = useMemo(() => {
    switch (difficulty) {
      case "easy":
        return "Easy - Friendly";
      case "hard":
        return "Hard - Skeptical";
      default:
        return "Medium - Realistic";
    }
  }, [difficulty]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load conferences, personas, and trainees with caching
  useEffect(() => {
    const CACHE_KEY = "hc_bootstrap_v2";
    const CACHE_TIMESTAMP_KEY = "hc_bootstrap_v2_ts";
    const CACHE_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes
    const isProduction = process.env.NODE_ENV === "production";
    const tsParam = searchParams?.get("ts");

    // Prevent double-fetch in StrictMode (ONLY in development)
    // In production, always allow refetch when ts param changes
    if (!isProduction && didLoadBootstrap.current && !tsParam) return;
    if (!isProduction && !tsParam) {
      didLoadBootstrap.current = true;
    }

    const loadData = async (isRefresh = false) => {
      try {
        // Try to load from sessionStorage cache first (ONLY in development)
        if (!isRefresh && !isProduction && typeof window !== "undefined") {
          const cached = sessionStorage.getItem(CACHE_KEY);
          const cachedTs = sessionStorage.getItem(CACHE_TIMESTAMP_KEY);

          if (cached && cachedTs) {
            const age = Date.now() - parseInt(cachedTs, 10);
            const data = JSON.parse(cached);

            // Use cached data immediately
            setConferences(data.conferences || []);
            setPersonas(data.personas || []);
            setTrainees(data.trainees || []);
            setDataLoading(false);

            // If cache is fresh enough, we're done
            if (age < CACHE_MAX_AGE_MS) {
              console.log(`[Bootstrap] Using cached data (${Math.round(age / 1000)}s old)`);
              return;
            }

            // Cache is stale, refresh in background
            console.log(`[Bootstrap] Cache stale, refreshing in background`);
            setDataRefreshing(true);
          }
        }

        // Fetch fresh data with cache-buster and no-store
        const controller = new AbortController();
        const cacheBuster = Date.now();
        const res = await fetch(`/api/bootstrap?ts=${cacheBuster}`, {
          signal: controller.signal,
          cache: "no-store"
        });

        if (res.ok) {
          const data = await res.json();

          setConferences(data.conferences || []);
          setPersonas(data.personas || []);
          setTrainees(data.trainees || []);

          // Update cache (ONLY in development)
          if (!isProduction && typeof window !== "undefined") {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
            sessionStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
          }

          console.log(`[Bootstrap] Loaded fresh data (${data._meta?.loadTimeMs}ms)`);
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          console.error("Failed to load data:", e);
        }
      } finally {
        setDataLoading(false);
        setDataRefreshing(false);
      }
    };

    loadData();

    // Add visibility change handler to refresh when tab becomes visible
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log("[Bootstrap] Tab became visible, refreshing data");
        loadData(true); // Force refresh
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      // Cleanup on unmount
      if (!isProduction) {
        didLoadBootstrap.current = false;
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [searchParams]); // Re-run when searchParams changes (including ts param)

  // Handle query params for auto-selection (only if items exist and are not archived)
  useEffect(() => {
    const conferenceId = searchParams?.get("conferenceId");
    const personaId = searchParams?.get("personaId");

    if (conferenceId && conferences.some((c) => c.id === conferenceId)) {
      setSelectedConferenceId(conferenceId);
    }
    if (personaId && personas.some((p) => p.id === personaId)) {
      setSelectedPersonaId(personaId);
    }
  }, [searchParams, conferences, personas]);

  // Resume session on refresh
  useEffect(() => {
    const restore = async () => {
      try {
        const savedId = window.localStorage.getItem(SESSION_STORAGE_KEY);
        if (!savedId) return;

        setLoading(true);

        const res = await fetch(`/api/session/${savedId}`, { method: "GET" });
        if (!res.ok) {
          window.localStorage.removeItem(SESSION_STORAGE_KEY);
          return;
        }

        const data = await res.json();

        if (data.active === false) {
          window.localStorage.removeItem(SESSION_STORAGE_KEY);
          return;
        }

        setSessionId(data.sessionId);
        setMessages(normalizeTranscript(data.transcript ?? []));
        setCurrentState(data.currentState || "ICEBREAKER");
        setViolations(data.violations || []);

        if (data.kickoff) {
          setDifficulty(data.kickoff.difficulty || "medium");
        }
      } catch (e) {
        console.error("Failed to restore session:", e);
        window.localStorage.removeItem(SESSION_STORAGE_KEY);
      } finally {
        setLoading(false);
      }
    };

    restore();
  }, []);

  const handleResetSession = async () => {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    setSessionId(null);
    setMessages([]);
    setViolations([]);
    setCurrentState("ICEBREAKER");

    if (!sessionId) return;

    try {
      await fetch(`/api/session/${sessionId}`, { method: "DELETE" });
    } catch (e) {
      console.error("Reset error:", e);
    }
  };

  const buildConferenceContext = (): string => {
    const conf = conferences.find((c) => c.id === selectedConferenceId);
    if (!conf) return "";

    return `Conference: ${conf.name}
Themes: ${conf.themes.join(", ")}
Seniority mix: ${conf.seniorityMix}
Observability maturity: ${conf.observabilityMaturity}`.trim();
  };

  const buildAttendeeProfile = (): string => {
    const persona = personas.find((p) => p.id === selectedPersonaId);
    if (!persona) return "";

    return `Persona: ${persona.personaType}
Modifiers: ${persona.modifiers.join("; ")}
Emotional posture: ${persona.emotionalPosture}
Tooling bias: ${persona.toolingBias}
OpenTelemetry familiarity: ${persona.otelFamiliarity}`.trim();
  };

const handleStartSession = async () => {
  const conferenceContext = buildConferenceContext();
  const attendeeProfile = buildAttendeeProfile();

  if (!conferenceContext.trim() || !attendeeProfile.trim()) {
    alert("Please select both conference and persona");
    return;
  }

  setLoading(true);

  try {
    const response = await fetch("/api/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conferenceContext,
        attendeeProfile,
        difficulty,
      }),
    });

    if (!response.ok) {
      throw new Error(`Session start failed: ${response.status}`);
    }

    // ✅ DEFINE `data` ONCE
    const data = await response.json();

    setSessionId(data.sessionId);
    setMessages(normalizeTranscript(data.transcript ?? []));
    setCurrentState(data.currentState || "ICEBREAKER");
    setViolations([]);

    window.localStorage.setItem(SESSION_STORAGE_KEY, data.sessionId);
  } catch (error) {
    console.error("Failed to start session:", error);
    alert("Failed to start session");
  } finally {
    setLoading(false);
  }
};

  const handleEndSession = async () => {
    if (!sessionId || loading) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/session/${sessionId}/end`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(`End failed: ${response.status}`);
      }

      const data = await response.json();
      if (data.feedback) {
        setMessages((prev) => [...prev, data.feedback]);
      }

      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      setSessionId(null);
    } catch (error) {
      console.error("Failed to end session:", error);
      alert("Failed to end session");
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !sessionId || loading) return;

    const userMessage = input.trim();
    setInput("");
    setLoading(true);

    try {
      const response = await fetch(`/api/session/${sessionId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage }),
      });

      if (!response.ok) {
        throw new Error(`Message failed: ${response.status}`);
      }

      const data = await response.json();

      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-trainee`,
          type: "trainee",
          text: userMessage,
          timestamp: new Date().toISOString(),
        },
        ...(data.message ? [data.message] : []),
      ]);

      setCurrentState(data.currentState || currentState);
      setViolations(data.violations || []);
    } catch (error) {
      console.error("Failed to send message:", error);
      alert("Failed to send message");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateInvite = async () => {
    const conferenceContext = buildConferenceContext();
    const attendeeProfile = buildAttendeeProfile();

    if (!conferenceContext.trim() || !attendeeProfile.trim()) {
      setInviteError("Please select both conference and persona");
      return;
    }

    if (!selectedTraineeId) {
      setInviteError("Please select a trainee");
      return;
    }

    const selectedTrainee = trainees.find((t) => t.id === selectedTraineeId);
    if (!selectedTrainee) {
      setInviteError("Selected trainee not found");
      return;
    }

    setIsCreatingInvite(true);
    setInviteError("");

    try {
      const response = await fetch("/api/invite/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conferenceContext,
          attendeeProfile,
          difficulty,
          conferenceId: selectedConferenceId,
          personaId: selectedPersonaId,
          traineeId: selectedTraineeId,
          traineeName: formatTraineeFull(selectedTrainee),
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to create invite");
      }

      const data = await response.json();
      const fullUrl = `${window.location.origin}/s/${data.token}`;
      setInviteUrl(fullUrl);
      setInviteToken(data.token);

      // Update enrichment status
      if (data.enrichment) {
        setEnrichmentProvider(data.enrichment.provider);
        setEnrichmentStatus(data.enrichment.cached ? "cached" : "fresh");
      } else {
        setEnrichmentProvider(null);
        setEnrichmentStatus("none");
      }
    } catch (error: any) {
      console.error("Failed to create invite:", error);
      setInviteError(error.message || "Failed to create invite");
    } finally {
      setIsCreatingInvite(false);
    }
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Scenario Builder</h1>
          <p className="text-white/70 text-sm">
            Practice discovery conversations with AI-powered attendees
          </p>
        </div>

        <div className="flex items-center gap-3">
          {enrichmentProvider && (
            <div className="text-xs text-gray-400 border border-white/10 rounded px-2 py-1">
              <span className="font-mono">
                {enrichmentProvider}
              </span>
              {" | "}
              <span className={enrichmentStatus === "fresh" ? "text-green-400" : enrichmentStatus === "cached" ? "text-blue-400" : "text-gray-500"}>
                {enrichmentStatus}
              </span>
            </div>
          )}
          <div className="text-sm text-gray-300">
            State: <span className="font-semibold">{currentState}</span>
          </div>
          <div
            className={`px-3 py-1 rounded-full text-sm ${active
              ? "bg-emerald-500/15 text-emerald-200 border border-emerald-400/20"
              : "bg-white/10 text-white/70 border border-white/10"
              }`}
          >
            {active ? "● Active" : "● Inactive"}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <BrandButton onClick={handleStartSession} disabled={loading} variant="lime">
          <Play size={16} /> Start Session
        </BrandButton>

        <BrandButton
          onClick={handleEndSession}
          disabled={!sessionId || loading}
          variant="red"
        >
          <Square size={16} /> End Session
        </BrandButton>

        <BrandButton
          onClick={handleResetSession}
          disabled={loading || !sessionId}
          variant="neutral"
          title="Clears the current session and starts fresh"
        >
          Reset Session
        </BrandButton>
      </div>

      {/* Trainee Share Link */}
      <div className="rounded-lg border border-white/15 bg-white/7 p-4 space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-200">Trainee Share Link</div>
          <BrandButton
            onClick={handleCreateInvite}
            disabled={isCreatingInvite}
            variant="indigo"
            className="text-sm"
          >
            {isCreatingInvite ? "Creating..." : "Create Link"}
          </BrandButton>
        </div>

        {inviteError ? (
          <div className="mt-2 text-sm text-red-300">{inviteError}</div>
        ) : null}

        {inviteUrl ? (
          <div className="mt-3 flex items-center gap-2">
            <input
              id="invite-link"
              value={inviteUrl}
              readOnly
              className="w-full rounded-md border border-white/20 bg-black/30 px-3 py-2 text-sm text-gray-100 outline-none focus:border-white/30 focus:ring-2 focus:ring-white/10"
            />
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(inviteUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch {
                  const el = document.getElementById("invite-link") as HTMLInputElement | null;
                  el?.focus();
                  el?.select();
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }
              }}
              className={`rounded-md border px-3 py-2 text-sm font-medium transition whitespace-nowrap ${copied
                ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-200"
                : "border-white/10 bg-white/10 hover:bg-white/15 text-gray-100"
                }`}
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
        ) : (
          <div className="mt-2 text-sm text-white/70">
            Create a link to send to a trainee. The trainee will not see the hidden profile.
          </div>
        )}

        {inviteToken ? (
          <div className="mt-2 text-xs text-gray-500">Token: {inviteToken}</div>
        ) : null}
      </div>

      {/* Setup Panel - Selection Only */}
      <div className="rounded-lg border border-white/15 bg-white/7 p-4 space-y-4 shadow-sm">
        {/* Conference Selection */}
        <div>
          <label className="block text-sm text-gray-300 mb-2 font-medium">
            Conference
            {dataRefreshing && <span className="ml-2 text-xs text-gray-500">(Refreshing...)</span>}
          </label>
          <select
            value={selectedConferenceId}
            onChange={(e) => setSelectedConferenceId(e.target.value)}
            disabled={dataLoading}
            className="w-full bg-black/30 border border-white/20 text-gray-100 rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-white/10 focus:border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">{dataLoading ? "Loading conferences..." : "Select a conference..."}</option>
            {conferences.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {selectedConferenceId && (
            <div className="text-xs text-gray-400 space-y-1 pl-2 mt-2">
              {(() => {
                const conf = conferences.find((c) => c.id === selectedConferenceId);
                if (!conf) return null;
                return (
                  <>
                    <div>Themes: {conf.themes.join(", ")}</div>
                    <div>Seniority: {conf.seniorityMix}</div>
                    <div>Maturity: {conf.observabilityMaturity}</div>
                  </>
                );
              })()}
            </div>
          )}
        </div>

        {/* Persona Selection */}
        <div>
          <label className="block text-sm text-gray-300 mb-2 font-medium">Persona</label>
          <select
            value={selectedPersonaId}
            onChange={(e) => setSelectedPersonaId(e.target.value)}
            disabled={dataLoading}
            className="w-full bg-black/30 border border-white/20 text-gray-100 rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-white/10 focus:border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">{dataLoading ? "Loading personas..." : "Select a persona..."}</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {selectedPersonaId && (
            <div className="text-xs text-gray-400 space-y-1 pl-2 mt-2">
              {(() => {
                const persona = personas.find((p) => p.id === selectedPersonaId);
                if (!persona) return null;
                return (
                  <>
                    <div>Type: {persona.personaType}</div>
                    <div>Posture: {persona.emotionalPosture}</div>
                    <div>OTel: {persona.otelFamiliarity}</div>
                  </>
                );
              })()}
            </div>
          )}
        </div>

        {/* Trainee Selection */}
        <div>
          <label className="block text-sm text-gray-300 mb-2 font-medium">
            Trainee *
          </label>
          <select
            value={selectedTraineeId}
            onChange={(e) => setSelectedTraineeId(e.target.value)}
            disabled={dataLoading}
            className="w-full bg-black/30 border border-white/20 text-gray-100 rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-white/10 focus:border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">{dataLoading ? "Loading trainees..." : "Select a trainee..."}</option>
            {trainees.map((t) => (
              <option key={t.id} value={t.id}>
                {formatTraineeFull(t)}
              </option>
            ))}
          </select>

          {selectedTraineeId && (
            <div className="text-xs text-gray-400 space-y-1 pl-2 mt-2">
              Required for creating invite links
            </div>
          )}
        </div>

        {/* Difficulty */}
        <div>
          <label className="block text-sm text-gray-300 mb-2">Difficulty</label>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as "easy" | "medium" | "hard")}
            className="w-full bg-black/30 border border-white/20 text-gray-100 rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-white/10 focus:border-white/30"
          >
            <option value="easy">Easy - Friendly</option>
            <option value="medium">Medium - Realistic</option>
            <option value="hard">Hard - Skeptical</option>
          </select>
          <div className="text-xs text-gray-400 mt-1">{difficultyLabel}</div>
        </div>
      </div>

      {/* Chat panel */}
      <div className="rounded-lg border border-white/15 bg-white/7 p-4 shadow-sm min-h-[320px]">
        {messages.length === 0 ? (
          <div className="text-gray-500 text-center py-20">
            Select conference and persona, then click Start to begin
          </div>
        ) : (
          <div className="space-y-3">
            {(messages ?? []).filter(Boolean).map((m) => {
              const isTrainee = m.type === "trainee";
              const isAttendee = m.type === "attendee";
              const bubble = isTrainee
                ? "bg-violet-500/40 border border-violet-400/20 ml-auto"
                : isAttendee
                  ? "bg-white/10 border border-white/10"
                  : "bg-sky-500/20 border border-sky-400/20";

              const label = isTrainee ? "You" : isAttendee ? "Attendee" : "System";

              return (
                <div key={m.id} className={`max-w-[75%] rounded-lg px-4 py-3 ${bubble}`}>
                  <div className="text-xs text-gray-200/80 mb-1">{label}</div>
                  <div className="whitespace-pre-wrap">{m.text}</div>
                  <div className="text-xs text-gray-200/60 mt-1">
                    {formatTime(m.timestamp)}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex items-center gap-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={sessionId ? "Your response..." : "Start a session to begin"}
          disabled={!sessionId || loading}
          className="flex-1 rounded-md px-4 py-3 bg-black/40 border border-white/25 text-gray-100 placeholder:text-gray-400 outline-none transition focus:border-sky-400/60 focus:ring-2 focus:ring-sky-400/20 disabled:opacity-60 disabled:bg-black/20"
        />
        <BrandButton
          onClick={handleSendMessage}
          disabled={!sessionId || loading || !input.trim()}
          variant="cobalt"
        >
          <Send size={16} /> Send
        </BrandButton>
      </div>

      {/* Debug panel */}
      <div className="rounded-lg border border-white/15 bg-white/7 shadow-sm">
        <button
          onClick={() => setDebugOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-200"
        >
          <span>🛠 Debug Panel</span>
          {debugOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {debugOpen && (
          <div className="px-4 pb-4 text-sm text-gray-300 space-y-2">
            <div>
              <span className="text-gray-400">sessionId:</span>{" "}
              <span className="font-mono">{sessionId ?? "(none)"}</span>
            </div>
            <div>
              <span className="text-gray-400">currentState:</span>{" "}
              <span className="font-mono">{currentState}</span>
            </div>
            <div>
              <span className="text-gray-400">violations:</span>{" "}
              {violations.length === 0 ? (
                <span className="text-green-300">none</span>
              ) : (
                <ul className="list-disc ml-5 mt-1">
                  {violations.map((v, idx) => (
                    <li key={`${idx}-${v}`}>{v}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="text-gray-500">
              Conference: {selectedConferenceId || "none"} | Persona:{" "}
              {selectedPersonaId || "none"}
            </div>
          </div>
        )}
      </div>

      {loading && <div className="text-xs text-gray-400">Working…</div>}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="max-w-5xl mx-auto py-20 text-center text-gray-400">Loading...</div>}>
      <HoneycombSimulator />
    </Suspense>
  );
}
