"use client";

import React, { useEffect, useRef, useState } from "react";
import { Send, Square } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { BrandButton } from "../../../components/ui/BrandButton";

interface Message {
  id: string;
  type: "system" | "trainee" | "attendee";
  text: string;
  timestamp: string;
}

const INVITE_TOKEN_STORAGE_KEY = "honeycomb_invite_token";

function formatTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function TraineePracticePage() {
  const params = useParams();
  const router = useRouter();
  const token = params?.token as string;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentState, setCurrentState] = useState("ICEBREAKER");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conferenceContext, setConferenceContext] = useState("");
  const [violations, setViolations] = useState<string[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const active = Boolean(sessionId);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  /**
   * Load session from invite token on mount
   */
  useEffect(() => {
    if (!token) {
      setError("Invalid invite link");
      return;
    }

    const loadSession = async () => {
      setLoading(true);
      try {
        // Persist token to localStorage
        window.localStorage.setItem(INVITE_TOKEN_STORAGE_KEY, token);

        // Resolve token to sessionId
        const inviteRes = await fetch(`/api/invite/${token}`);
        if (!inviteRes.ok) {
          const errData = await inviteRes.json().catch(() => ({}));
          setError(errData.error || "Invite link invalid or expired");
          return;
        }

        const inviteData = await inviteRes.json();
        const resolvedSessionId = inviteData.sessionId;

        // Fetch trainee-safe session data
        const sessionRes = await fetch(
          `/api/session/${resolvedSessionId}/trainee`
        );
        if (!sessionRes.ok) {
          setError("Failed to load session");
          return;
        }

        const sessionData = await sessionRes.json();

        if (sessionData.active === false) {
          setError("This session has ended");
          return;
        }

        setSessionId(sessionData.sessionId);
        setMessages(sessionData.transcript || []);
        setCurrentState(sessionData.currentState || "ICEBREAKER");
        setViolations(sessionData.violations || []);

        if (sessionData.kickoff?.conferenceContext) {
          setConferenceContext(sessionData.kickoff.conferenceContext);
        }

        setError(null);
      } catch (e) {
        console.error("Failed to load session:", e);
        setError("Failed to load session");
      } finally {
        setLoading(false);
      }
    };

    loadSession();
  }, [token]);

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

  const handleEndSession = async () => {
    if (!sessionId || loading) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/session/${sessionId}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }), // Pass token for scoring
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(`End failed: ${response.status} ${errText}`);
      }

      const data = await response.json();

      const feedbackMsg: Message | undefined = data.feedback ?? data.message;

      if (feedbackMsg) {
        setMessages((prev) => [...prev, feedbackMsg]);
      }

      window.localStorage.removeItem(INVITE_TOKEN_STORAGE_KEY);
      setSessionId(null);

      // Redirect to share page if available
      if (data.shareUrl) {
        // Small delay to show feedback message
        setTimeout(() => {
          router.push(data.shareUrl);
        }, 1000);
      }
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

  if (error) {
    return (
      <div className="flex items-center justify-center">
          <div className="max-w-md text-center">
            <h1 className="text-2xl font-semibold mb-4">Invite Error</h1>
            <p className="text-red-400 mb-4">{error}</p>
            <p className="text-gray-400 text-sm">
              Please check your invite link or contact your trainer.
            </p>
          </div>
        </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">
              Practice Session
            </h1>
            <p className="text-white/70 text-sm">
              {conferenceContext || "Loading..."}
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
          <BrandButton
            onClick={handleEndSession}
            disabled={!sessionId || loading}
            variant="red"
          >
            <Square size={16} /> End Session
          </BrandButton>
        </div>

        {/* Chat panel */}
        <div className="rounded-lg border border-white/15 bg-white/7 p-4 shadow-sm min-h-[400px]">
          {messages.length === 0 ? (
            <div className="text-gray-500 text-center py-20">
              {loading ? "Loading session..." : "No messages yet"}
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
            placeholder={sessionId ? "Your response..." : "Loading..."}
            disabled={!sessionId || loading}
            className="flex-1 bg-black/30 border border-white/20 text-gray-100 rounded-md px-4 py-3 outline-none focus:border-white/30 focus:ring-2 focus:ring-white/10 disabled:opacity-60"
          />
          <BrandButton
            onClick={handleSendMessage}
            disabled={!sessionId || loading || !input.trim()}
            variant="cobalt"
          >
            <Send size={16} /> Send
          </BrandButton>
        </div>

        {loading && <div className="text-xs text-gray-400">Working…</div>}
      </div>
  );
}
