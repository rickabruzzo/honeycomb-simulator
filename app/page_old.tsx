"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Send, Play, Square, ChevronDown, ChevronUp } from "lucide-react";
import { BrandButton } from "../components/ui/BrandButton";
import { ChipInput } from "../components/ui/ChipInput";
import type { Conference, Persona } from "../lib/scenarioTypes";

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
  // Session state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentState, setCurrentState] = useState("ICEBREAKER");
  const [loading, setLoading] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [violations, setViolations] = useState<string[]>([]);

  // Mode selection
  const [entryMode, setEntryMode] = useState<"structured" | "manual">("structured");

  // Structured mode state
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedConferenceId, setSelectedConferenceId] = useState<string>("");
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>("");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");

  // Conference creation state
  const [showConferenceForm, setShowConferenceForm] = useState(false);
  const [newConference, setNewConference] = useState<{
    name: string;
    themes: string[];
    seniorityMix: string;
    observabilityMaturity: "Low" | "Medium" | "High";
    urls: string;
  }>({
    name: "",
    themes: [],
    seniorityMix: "",
    observabilityMaturity: "Medium",
    urls: "",
  });

  // Persona creation state
  const [showPersonaForm, setShowPersonaForm] = useState(false);
  const [newPersona, setNewPersona] = useState<{
    name: string;
    personaType: string;
    modifiers: string[];
    emotionalPosture: string;
    toolingBias: string;
    otelFamiliarity: "never" | "aware" | "considering" | "starting" | "active";
    notes: string;
  }>({
    name: "",
    personaType: "",
    modifiers: [],
    emotionalPosture: "",
    toolingBias: "",
    otelFamiliarity: "never",
    notes: "",
  });

  // Manual mode state (for backward compatibility)
  const [manualConferenceContext, setManualConferenceContext] = useState("");
  const [manualAttendeeProfile, setManualAttendeeProfile] = useState("");

  // Invite state
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

  // Load conferences and personas
  useEffect(() => {
    const loadData = async () => {
      try {
        const [confRes, personaRes] = await Promise.all([
          fetch("/api/conferences"),
          fetch("/api/personas"),
        ]);

        if (confRes.ok) {
          const confData = await confRes.json();
          setConferences(confData.conferences || []);
        }

        if (personaRes.ok) {
          const personaData = await personaRes.json();
          setPersonas(personaData.personas || []);
        }
      } catch (e) {
        console.error("Failed to load data:", e);
      }
    };

    loadData();
  }, []);

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
        setMessages(data.transcript || []);
        setCurrentState(data.currentState || "ICEBREAKER");
        setViolations(data.violations || []);

        if (data.kickoff) {
          setDifficulty(data.kickoff.difficulty || "medium");
          // Store in manual mode for display
          setManualConferenceContext(data.kickoff.conferenceContext || "");
          setManualAttendeeProfile(data.kickoff.attendeeProfile || "");
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
    if (entryMode === "manual") {
      return manualConferenceContext;
    }

    const conf = conferences.find((c) => c.id === selectedConferenceId);
    if (!conf) return "";

    return `Conference: ${conf.name}
Themes: ${conf.themes.join(", ")}
Seniority mix: ${conf.seniorityMix}
Observability maturity: ${conf.observabilityMaturity}`.trim();
  };

  const buildAttendeeProfile = (): string => {
    if (entryMode === "manual") {
      return manualAttendeeProfile;
    }

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
      alert("Please fill in all required fields");
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

      const data = await response.json();

      setSessionId(data.sessionId);
      setMessages([data.message]);
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

  const handleCreateInvite = async () => {
    const conferenceContext = buildConferenceContext();
    const attendeeProfile = buildAttendeeProfile();

    if (!conferenceContext.trim() || !attendeeProfile.trim()) {
      setInviteError("Please fill in all required fields first");
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
          personaId: entryMode === "structured" ? selectedPersonaId : undefined,
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
    } catch (error: any) {
      console.error("Failed to create invite:", error);
      setInviteError(error.message || "Failed to create invite");
    } finally {
      setIsCreatingInvite(false);
    }
  };

  const handleCreateConference = async () => {
    if (!newConference.name.trim()) {
      alert("Conference name is required");
      return;
    }

    try {
      const response = await fetch("/api/conferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newConference.name,
          themes: newConference.themes,
          seniorityMix: newConference.seniorityMix,
          observabilityMaturity: newConference.observabilityMaturity,
          sources: newConference.urls.trim()
            ? {
                urls: newConference.urls
                  .split(",")
                  .map((u) => u.trim())
                  .filter(Boolean),
              }
            : undefined,
        }),
      });

      if (!response.ok) throw new Error("Failed to create conference");

      const data = await response.json();
      setConferences((prev) => [data.conference, ...prev]);
      setSelectedConferenceId(data.conference.id);
      setShowConferenceForm(false);
      setNewConference({
        name: "",
        themes: [],
        seniorityMix: "",
        observabilityMaturity: "Medium",
        urls: "",
      });
    } catch (error) {
      console.error("Failed to create conference:", error);
      alert("Failed to create conference");
    }
  };

  const handleCreatePersona = async () => {
    if (!newPersona.name.trim() || !newPersona.personaType.trim()) {
      alert("Persona name and type are required");
      return;
    }

    try {
      const response = await fetch("/api/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newPersona.name,
          personaType: newPersona.personaType,
          modifiers: newPersona.modifiers,
          emotionalPosture: newPersona.emotionalPosture,
          toolingBias: newPersona.toolingBias,
          otelFamiliarity: newPersona.otelFamiliarity,
          sources: newPersona.notes.trim()
            ? { notes: newPersona.notes }
            : undefined,
        }),
      });

      if (!response.ok) throw new Error("Failed to create persona");

      const data = await response.json();
      setPersonas((prev) => [data.persona, ...prev]);
      setSelectedPersonaId(data.persona.id);
      setShowPersonaForm(false);
      setNewPersona({
        name: "",
        personaType: "",
        modifiers: [],
        emotionalPosture: "",
        toolingBias: "",
        otelFamiliarity: "never",
        notes: "",
      });
    } catch (error) {
      console.error("Failed to create persona:", error);
      alert("Failed to create persona");
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
            className={`px-3 py-1 rounded-full text-sm ${
              active
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
              className={`rounded-md border px-3 py-2 text-sm font-medium transition whitespace-nowrap ${
                copied
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

      {/* Mode Selection */}
      <div>
        <label className="block text-sm text-gray-300 mb-2">Entry Mode</label>
        <div className="flex gap-2">
          <button
            onClick={() => setEntryMode("structured")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
              entryMode === "structured"
                ? "bg-[#51368D] text-white"
                : "bg-white/10 text-gray-300 hover:bg-white/15"
            }`}
          >
            Structured (Recommended)
          </button>
          <button
            onClick={() => setEntryMode("manual")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
              entryMode === "manual"
                ? "bg-[#51368D] text-white"
                : "bg-white/10 text-gray-300 hover:bg-white/15"
            }`}
          >
            Custom / Manual Entry
          </button>
        </div>
        <div className="text-xs text-gray-400 mt-1">
          {entryMode === "structured"
            ? "Select from existing conferences and personas, or create new ones"
            : "Manually enter conference context and attendee profile as free text"}
        </div>
      </div>

      {/* Setup Panel - Structured Mode */}
      {entryMode === "structured" && (
        <div className="rounded-lg border border-white/15 bg-white/7 p-4 space-y-4 shadow-sm">
          {/* Conference Section */}
          <div>
            <label className="block text-sm text-gray-300 mb-2 font-medium">
              Conference
            </label>

            {!showConferenceForm ? (
              <div className="space-y-2">
                <select
                  value={selectedConferenceId}
                  onChange={(e) => {
                    if (e.target.value === "__new__") {
                      setShowConferenceForm(true);
                    } else {
                      setSelectedConferenceId(e.target.value);
                    }
                  }}
                  className="w-full bg-black/30 border border-white/20 text-gray-100 rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-white/10 focus:border-white/30"
                >
                  <option value="">Select a conference...</option>
                  {conferences.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value="__new__">+ New Conference...</option>
                </select>

                {selectedConferenceId && (
                  <div className="text-xs text-gray-400 space-y-1 pl-2">
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
            ) : (
              <div className="space-y-3 border border-white/10 bg-black/20 p-3 rounded-md">
                <div className="text-sm font-medium text-gray-200">Create New Conference</div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">Name *</label>
                  <input
                    value={newConference.name}
                    onChange={(e) =>
                      setNewConference((p) => ({ ...p, name: e.target.value }))
                    }
                    placeholder="e.g., KubeCon 2024"
                    className="w-full bg-black/30 border border-white/20 text-gray-100 rounded px-2 py-1.5 text-sm outline-none focus:border-white/30"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Themes
                  </label>
                  <ChipInput
                    value={newConference.themes}
                    onChange={(themes) =>
                      setNewConference((p) => ({ ...p, themes }))
                    }
                    placeholder="Type themes and press Enter or comma"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">Seniority Mix</label>
                  <input
                    value={newConference.seniorityMix}
                    onChange={(e) =>
                      setNewConference((p) => ({ ...p, seniorityMix: e.target.value }))
                    }
                    placeholder="e.g., IC-heavy with platform leads"
                    className="w-full bg-black/30 border border-white/20 text-gray-100 rounded px-2 py-1.5 text-sm outline-none focus:border-white/30"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Observability Maturity
                  </label>
                  <select
                    value={newConference.observabilityMaturity}
                    onChange={(e) =>
                      setNewConference((p) => ({
                        ...p,
                        observabilityMaturity: e.target.value as "Low" | "Medium" | "High",
                      }))
                    }
                    className="w-full bg-black/30 border border-white/20 text-gray-100 rounded px-2 py-1.5 text-sm outline-none focus:border-white/30"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    URLs (comma-separated, optional)
                  </label>
                  <input
                    value={newConference.urls}
                    onChange={(e) =>
                      setNewConference((p) => ({ ...p, urls: e.target.value }))
                    }
                    placeholder="https://..."
                    className="w-full bg-black/30 border border-white/20 text-gray-100 rounded px-2 py-1.5 text-sm outline-none focus:border-white/30"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleCreateConference}
                    className="px-3 py-1.5 rounded bg-[#64BA00] hover:bg-[#4CA600] text-gray-950 text-sm font-medium"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => setShowConferenceForm(false)}
                    className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/15 text-gray-100 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Persona Section */}
          <div>
            <label className="block text-sm text-gray-300 mb-2 font-medium">Persona</label>

            {!showPersonaForm ? (
              <div className="space-y-2">
                <select
                  value={selectedPersonaId}
                  onChange={(e) => {
                    if (e.target.value === "__new__") {
                      setShowPersonaForm(true);
                    } else {
                      setSelectedPersonaId(e.target.value);
                    }
                  }}
                  className="w-full bg-black/30 border border-white/20 text-gray-100 rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-white/10 focus:border-white/30"
                >
                  <option value="">Select a persona...</option>
                  {personas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                  <option value="__new__">+ New Persona...</option>
                </select>

                {selectedPersonaId && (
                  <div className="text-xs text-gray-400 space-y-1 pl-2">
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
            ) : (
              <div className="space-y-3 border border-white/10 bg-black/20 p-3 rounded-md">
                <div className="text-sm font-medium text-gray-200">Create New Persona</div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">Name *</label>
                  <input
                    value={newPersona.name}
                    onChange={(e) => setNewPersona((p) => ({ ...p, name: e.target.value }))}
                    placeholder="e.g., SRE — Alert fatigue"
                    className="w-full bg-black/30 border border-white/20 text-gray-100 rounded px-2 py-1.5 text-sm outline-none focus:border-white/30"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">Persona Type *</label>
                  <input
                    value={newPersona.personaType}
                    onChange={(e) =>
                      setNewPersona((p) => ({ ...p, personaType: e.target.value }))
                    }
                    placeholder="e.g., SRE, Director of Engineering"
                    className="w-full bg-black/30 border border-white/20 text-gray-100 rounded px-2 py-1.5 text-sm outline-none focus:border-white/30"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Modifiers
                  </label>
                  <ChipInput
                    value={newPersona.modifiers}
                    onChange={(modifiers) =>
                      setNewPersona((p) => ({ ...p, modifiers }))
                    }
                    placeholder="Type modifiers and press Enter or comma"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">Emotional Posture</label>
                  <input
                    value={newPersona.emotionalPosture}
                    onChange={(e) =>
                      setNewPersona((p) => ({ ...p, emotionalPosture: e.target.value }))
                    }
                    placeholder="e.g., Guarded, thoughtful"
                    className="w-full bg-black/30 border border-white/20 text-gray-100 rounded px-2 py-1.5 text-sm outline-none focus:border-white/30"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">Tooling Bias</label>
                  <input
                    value={newPersona.toolingBias}
                    onChange={(e) =>
                      setNewPersona((p) => ({ ...p, toolingBias: e.target.value }))
                    }
                    placeholder="e.g., Prometheus + Grafana + ELK Stack"
                    className="w-full bg-black/30 border border-white/20 text-gray-100 rounded px-2 py-1.5 text-sm outline-none focus:border-white/30"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    OpenTelemetry Familiarity
                  </label>
                  <select
                    value={newPersona.otelFamiliarity}
                    onChange={(e) =>
                      setNewPersona((p) => ({
                        ...p,
                        otelFamiliarity: e.target.value as
                          | "never"
                          | "aware"
                          | "considering"
                          | "starting"
                          | "active",
                      }))
                    }
                    className="w-full bg-black/30 border border-white/20 text-gray-100 rounded px-2 py-1.5 text-sm outline-none focus:border-white/30"
                  >
                    <option value="never">Never heard</option>
                    <option value="aware">Aware</option>
                    <option value="considering">Considering</option>
                    <option value="starting">Starting</option>
                    <option value="active">Active user</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Notes (optional)
                  </label>
                  <textarea
                    value={newPersona.notes}
                    onChange={(e) => setNewPersona((p) => ({ ...p, notes: e.target.value }))}
                    placeholder="Additional context or notes"
                    className="w-full bg-black/30 border border-white/20 text-gray-100 rounded px-2 py-1.5 text-sm outline-none focus:border-white/30 min-h-[60px]"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleCreatePersona}
                    className="px-3 py-1.5 rounded bg-[#64BA00] hover:bg-[#4CA600] text-gray-950 text-sm font-medium"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => setShowPersonaForm(false)}
                    className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/15 text-gray-100 text-sm"
                  >
                    Cancel
                  </button>
                </div>
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
      )}

      {/* Setup Panel - Manual Mode */}
      {entryMode === "manual" && (
        <div className="rounded-lg border border-white/15 bg-white/7 p-4 space-y-3 shadow-sm">
          <div>
            <label className="block text-sm text-gray-300 mb-1">Conference Context</label>
            <input
              value={manualConferenceContext}
              onChange={(e) => setManualConferenceContext(e.target.value)}
              placeholder="e.g., KubeCon booth, Tuesday afternoon"
              className="w-full bg-black/30 border border-white/20 text-gray-100 rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-white/10 focus:border-white/30"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">
              Hidden Attendee Profile (Secret)
            </label>
            <textarea
              value={manualAttendeeProfile}
              onChange={(e) => setManualAttendeeProfile(e.target.value)}
              placeholder="e.g., Backend engineer, 5 years exp, using Datadog, frustrated with correlation, OTel: AWARE"
              className="w-full min-h-[84px] bg-black/20 border-white/10 text-gray-100 rounded-md px-3 py-2 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Difficulty</label>
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
      )}

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
              Mode: {entryMode} | Conference: {selectedConferenceId || "none"} | Persona:{" "}
              {selectedPersonaId || "none"}
            </div>
          </div>
        )}
      </div>

      {loading && <div className="text-xs text-gray-400">Working…</div>}
    </div>
  );
}
