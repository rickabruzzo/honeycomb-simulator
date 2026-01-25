"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Send, Play, Square, ChevronDown, ChevronUp } from "lucide-react";
import { PERSONAS } from "../lib/personas";
import { TopNav } from "../components/TopNav";
import { BrandButton } from "../components/ui/BrandButton";

interface Message {
  id: string;
  type: "system" | "trainee" | "attendee";
  text: string;
  timestamp: string;
}

const SESSION_STORAGE_KEY = "honeycomb_simulator_session_id";

function formatTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function HoneycombSimulator() {
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>("custom");
  const isPresetSelected = selectedPersonaId !== "custom";
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentState, setCurrentState] = useState("ICEBREAKER");
  const [loading, setLoading] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);

  const [conferenceContext, setConferenceContext] = useState("");
  const [attendeeProfile, setAttendeeProfile] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [violations, setViolations] = useState<string[]>([]);

  const [inviteUrl, setInviteUrl] = useState<string>("");
  const [inviteToken, setInviteToken] = useState<string>("");
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  /**
   * ✅ Resume session on refresh (client-side pointer -> server-side KV session)
   */
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
        setMessages(data.transcript || []);
        setCurrentState(data.currentState || "ICEBREAKER");
        setViolations(data.violations || []);

        if (data.kickoff) {
          setConferenceContext(data.kickoff.conferenceContext || "");
          setAttendeeProfile(data.kickoff.attendeeProfile || "");
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

  useEffect(() => {
    // If user switches back to manual entry, clear the fields
    if (selectedPersonaId === "custom") {
      setConferenceContext("");
      setAttendeeProfile("");
      setDifficulty("medium");
      return;
    }

    const preset = PERSONAS.find((p) => p.id === selectedPersonaId);
    if (!preset) return;

    setConferenceContext(preset.conferenceContext);
    setAttendeeProfile(preset.attendeeProfile);
    setDifficulty(preset.difficulty);
  }, [selectedPersonaId]);

  const handleResetSession = async () => {
    // Always clear client-side pointer + UI first (so Reset is instant)
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    setSessionId(null);
    setMessages([]);
    setViolations([]);
    setCurrentState("ICEBREAKER");

    // Optional: clear setup fields too (uncomment if you want)
    // setConferenceContext("");
    // setAttendeeProfile("");
    // setDifficulty("medium");

    // If there was an active session, delete it server-side
    if (!sessionId) return;

    try {
      await fetch(`/api/session/${sessionId}`, { method: "DELETE" });
    } catch (e) {
      // Not fatal — client reset already happened
      console.error("Failed to delete session on server:", e);
    }
  };

  const handleStartSession = async () => {
    if (!conferenceContext.trim() || !attendeeProfile.trim()) {
      alert("Please fill in conference context and attendee profile");
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
        const errText = await response.text().catch(() => "");
        throw new Error(`Start failed: ${response.status} ${errText}`);
      }

      const data = await response.json();

      setSessionId(data.sessionId);
      window.localStorage.setItem(SESSION_STORAGE_KEY, data.sessionId);

      setMessages(data.transcript || []);
      setCurrentState(data.currentState || "ICEBREAKER");
      setViolations([]);
    } catch (error) {
      console.error("Failed to start session:", error);
      alert("Failed to start session");
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
        const errText = await response.text().catch(() => "");
        throw new Error(`Message failed: ${response.status} ${errText}`);
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
        data.message,
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

  async function handleCreateInvite() {
    try {
      setInviteError("");
      setIsCreatingInvite(true);

      const body =
        selectedPersonaId && selectedPersonaId !== "custom"
          ? { personaId: selectedPersonaId }
          : { conferenceContext, attendeeProfile, difficulty };

      const res = await fetch("/api/invite/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to create invite");

      const fullUrl = `${window.location.origin}${data.url}`;
      setInviteUrl(fullUrl);
      setInviteToken(data.token);
    } catch (e: any) {
      setInviteError(e?.message || "Failed to create invite");
    } finally {
      setIsCreatingInvite(false);
    }
  }

  const handleEndSession = async () => {
    if (!sessionId || loading) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/session/${sessionId}/end`, {
        method: "POST",
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(`End failed: ${response.status} ${errText}`);
      }

      const data = await response.json();

      // Some implementations return { feedback: Message } or { message: Message }
      const feedbackMsg: Message | undefined = data.feedback ?? data.message;

      if (feedbackMsg) {
        setMessages((prev) => [...prev, feedbackMsg]);
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

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="min-h-screen text-gray-100">
      <TopNav />
      <div className="max-w-5xl mx-auto space-y-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Trainer Dashboard</h1>
            <p className="text-white/70 text-sm">
              Practice discovery conversations with AI-powered attendees
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-300">
              State: <span className="font-semibold">{currentState}</span>
            </div>
            <div
              className={`px-3 py-1 rounded-full text-sm ${active ? "bg-emerald-500/15 text-emerald-200 border border-emerald-400/20" : "bg-white/10 text-white/70 border border-white/10"
                }`}
            >
              {active ? "● Active" : "● Inactive"}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          <BrandButton
            onClick={handleStartSession}
            disabled={loading}
            variant="lime"
          >
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
        <div className="rounded-lg border border-white/15 bg-white/7 p-4 space-y-3 shadow-sm">
          {/* Trainee Share Link */}
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
        {/* Setup panel */}
        <div>
          <label className="block text-sm text-gray-300 mb-1">Persona Preset</label>
          <div className="text-xs text-gray-400">
            Personas loaded: {PERSONAS.length} | Selected: {selectedPersonaId}
          </div>
          <div className="flex gap-2">
            <select
              value={selectedPersonaId}
              onChange={(e) => setSelectedPersonaId(e.target.value)}
              className="w-full bg-black/30 border border-white/20 text-gray-100 rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-white/10 focus:border-white/30"
            >
              <option value="custom">Custom (manual entry)</option>
              {PERSONAS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            {isPresetSelected && (
              <button
                type="button"
                onClick={() => setSelectedPersonaId("custom")}
                className="px-3 py-2 rounded-md bg-white/10 hover:bg-white/15 border border-white/10 text-sm text-gray-100"
                title="Switch to custom and edit freely"
              >
                Customize
              </button>
            )}
          </div>

          <div className="text-xs text-gray-400 mt-1">
            Choose a preset to auto-fill fields. Use “Customize” to edit.
          </div>
        </div>
        <div className="rounded-lg border border-white/15 bg-white/7 p-4 space-y-3 shadow-sm">
          <div>
            <label className="block text-sm text-gray-300 mb-1">Conference Context</label>
            <input
              value={conferenceContext}
              onChange={(e) => setConferenceContext(e.target.value)}
              placeholder="e.g., KubeCon booth, Tuesday afternoon"
              readOnly={isPresetSelected}
              className="w-full bg-black/30 border border-white/20 text-gray-100 rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-white/10 focus:border-white/30"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">
              Hidden Attendee Profile (Secret)
            </label>
            <textarea
              value={attendeeProfile}
              onChange={(e) => setAttendeeProfile(e.target.value)}
              readOnly={isPresetSelected}
              placeholder='e.g., Backend engineer, 5 years exp, using Datadog, frustrated with correlation, OTel: AWARE'
              className="w-full min-h-[84px] bg-black/20 border-white/10 text-gray-100 rounded-md px-3 py-2 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Difficulty</label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              disabled={isPresetSelected}
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
              Configure session and click Start to begin
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((m) => {
                const isTrainee = m.type === "trainee";
                const isAttendee = m.type === "attendee";
                const bubble =
                  isTrainee
                    ? "bg-violet-500/40 border border-violet-400/20 ml-auto"
                    : isAttendee
                      ? "bg-white/10 border border-white/10"
                      : "bg-sky-500/20 border border-sky-400/20";

                const label =
                  isTrainee ? "You" : isAttendee ? "Attendee" : "System";

                return (
                  <div
                    key={m.id}
                    className={`max-w-[75%] rounded-lg px-4 py-3 ${bubble}`}
                  >
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
                Tip: hard refresh should now restore sessions once
                <code className="mx-1 px-1 bg-black/20 border border-white/10 rounded">/api/session/[id]</code>
                exists and localStorage has the session id.
              </div>
            </div>
          )}
        </div>

        {loading && (
          <div className="text-xs text-gray-400">Working…</div>
        )}
      </div>
    </div>
  );
}