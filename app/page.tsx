"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Send, Play, Square, ChevronDown, ChevronUp } from "lucide-react";
import { PERSONAS } from "../lib/personas";

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
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Honeycomb Conference Simulator</h1>
            <p className="text-gray-400 text-sm">
              Practice discovery conversations with AI-powered attendees
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-300">
              State: <span className="font-semibold">{currentState}</span>
            </div>
            <div
              className={`px-3 py-1 rounded-full text-sm ${active ? "bg-green-800 text-green-100" : "bg-gray-700 text-gray-200"
                }`}
            >
              {active ? "● Active" : "● Inactive"}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleStartSession}
            disabled={loading}
            className="inline-flex items-center gap-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 px-4 py-2 rounded-md"
          >
            <Play size={16} /> Start Session
          </button>

          <button
            onClick={handleEndSession}
            disabled={!sessionId || loading}
            className="inline-flex items-center gap-2 bg-red-700 hover:bg-red-600 disabled:opacity-50 px-4 py-2 rounded-md"
          >
            <Square size={16} /> End Session
          </button>
          <button
            onClick={handleResetSession}
            disabled={loading && !sessionId}
            className="inline-flex items-center gap-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 px-4 py-2 rounded-md"
            title="Clears the current session and starts fresh"
          >
            Reset Session
          </button>
        </div>
        {/* Trainee Share Link */}
        <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-200">Trainee Share Link</div>
            <button
              onClick={handleCreateInvite}
              disabled={isCreatingInvite}
              className="rounded-md bg-indigo-600 hover:bg-indigo-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {isCreatingInvite ? "Creating..." : "Create Link"}
            </button>
          </div>

          {inviteError ? (
            <div className="mt-2 text-sm text-red-300">{inviteError}</div>
          ) : null}

          {inviteUrl ? (
            <div className="mt-3 flex items-center gap-2">
              <input
                value={inviteUrl}
                readOnly
                className="w-full rounded-md border border-gray-700 bg-gray-950/60 px-3 py-2 text-sm text-gray-200 outline-none"
              />
              <button
                onClick={() => navigator.clipboard.writeText(inviteUrl)}
                className="rounded-md border border-gray-600 bg-gray-800 hover:bg-gray-700 px-3 py-2 text-sm text-gray-200"
              >
                Copy
              </button>
            </div>
          ) : (
            <div className="mt-2 text-sm text-gray-400">
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
              className="w-full bg-gray-900/60 border border-gray-700 rounded-md px-3 py-2 outline-none"
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
                className="px-3 py-2 rounded-md bg-gray-700 hover:bg-gray-600 text-sm"
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
        <div className="bg-gray-800/40 border border-gray-700 rounded-lg p-4 space-y-3">
          <div>
            <label className="block text-sm text-gray-300 mb-1">Conference Context</label>
            <input
              value={conferenceContext}
              onChange={(e) => setConferenceContext(e.target.value)}
              placeholder="e.g., KubeCon booth, Tuesday afternoon"
              readOnly={isPresetSelected}
              className="w-full bg-gray-900/60 border border-gray-700 rounded-md px-3 py-2 outline-none"
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
              className="w-full min-h-[84px] bg-gray-900/60 border border-gray-700 rounded-md px-3 py-2 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Difficulty</label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              disabled={isPresetSelected}
              className="w-full bg-gray-900/60 border border-gray-700 rounded-md px-3 py-2 outline-none"
            >
              <option value="easy">Easy - Friendly</option>
              <option value="medium">Medium - Realistic</option>
              <option value="hard">Hard - Skeptical</option>
            </select>
            <div className="text-xs text-gray-400 mt-1">{difficultyLabel}</div>
          </div>
        </div>

        {/* Chat panel */}
        <div className="bg-gray-800/30 border border-gray-700 rounded-lg p-4 min-h-[320px]">
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
                    ? "bg-indigo-600/80 ml-auto"
                    : isAttendee
                      ? "bg-gray-700/60"
                      : "bg-blue-800/60";

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
            className="flex-1 bg-gray-900/60 border border-gray-700 rounded-md px-4 py-3 outline-none disabled:opacity-60"
          />
          <button
            onClick={handleSendMessage}
            disabled={!sessionId || loading || !input.trim()}
            className="inline-flex items-center gap-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 px-4 py-3 rounded-md"
          >
            <Send size={16} /> Send
          </button>
        </div>

        {/* Debug panel */}
        <div className="bg-gray-800/30 border border-gray-700 rounded-lg">
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
                <code className="mx-1 px-1 bg-gray-900/60 rounded">/api/session/[id]</code>
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