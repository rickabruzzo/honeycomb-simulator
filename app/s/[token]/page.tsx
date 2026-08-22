"use client";

import React, { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { BrandButton } from "../../../components/ui/BrandButton";
import type { RevealedAttributes } from "../../../lib/attendee/trainingWheels";

interface Message {
  id: string;
  type: "system" | "trainee" | "attendee";
  text: string;
  timestamp: string;
}

const INVITE_TOKEN_STORAGE_KEY = "honeycomb_invite_token";

// Pointy-top hexagon (matches the brand logomark / scorecard grade badge).
const HEX_CLIP = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

type MomentumBand = "GUARDED" | "CURIOUS" | "ENGAGED" | "COMMITTED";

function bandForScore(score: number): MomentumBand {
  if (score >= 51) return "COMMITTED";
  if (score >= 31) return "ENGAGED";
  if (score >= 16) return "CURIOUS";
  return "GUARDED";
}

// Band chip colours drawn from the brand palette.
const BAND_STYLE: Record<MomentumBand, string> = {
  GUARDED: "border-[#e65b53]/50 text-[#e65b53]",
  CURIOUS: "border-[#ffb000]/60 text-[#ffb000]",
  ENGAGED: "border-[#0298ec]/60 text-[#0298ec]",
  COMMITTED: "border-[#64ba00]/60 text-[#64ba00]",
};

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
  const [violations, setViolations] = useState<string[]>([]);
  const [trainingWheels, setTrainingWheels] = useState(false);
  const [revealed, setRevealed] = useState<RevealedAttributes | null>(null);
  const [momentumScore, setMomentumScore] = useState(0);
  const [endPrompt, setEndPrompt] = useState<{
    outcome: string;
    actionLabel: string;
    actionType: string;
    tooltip?: string;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

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
        setTrainingWheels(Boolean(sessionData.trainingWheels));
        setRevealed(sessionData.revealed ?? null);
        setMomentumScore(sessionData.momentum?.score ?? 0);

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

      // Build new messages array
      const newMessages: Message[] = [
        ...messages,
        {
          id: `${Date.now()}-trainee`,
          type: "trainee",
          text: userMessage,
          timestamp: new Date().toISOString(),
        },
        data.message,
      ];

      setMessages(newMessages);
      setCurrentState(data.currentState || currentState);
      setViolations(data.violations || []);
      if (data.revealed !== undefined) setRevealed(data.revealed);
      if (data.momentum?.score !== undefined) setMomentumScore(data.momentum.score);

      // Handle completion CTA
      if (data.endPrompt) {
        setEndPrompt(data.endPrompt);
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      alert("Failed to send message");
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteSession = async () => {
    if (!sessionId || loading || !endPrompt) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/session/${sessionId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionType: endPrompt.actionType }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(`Complete failed: ${response.status} ${errText}`);
      }

      const data = await response.json();

      // Clear session state
      window.localStorage.removeItem(INVITE_TOKEN_STORAGE_KEY);
      setSessionId(null);
      setEndPrompt(null);

      // Redirect to score page
      if (data.shareUrl) {
        router.push(data.shareUrl);
      } else {
        // Fallback: show toast if no shareUrl
        alert("Session ended, but score link unavailable. Check server logs.");
      }
    } catch (error) {
      console.error("Failed to complete session:", error);
      alert("Failed to complete session");
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

  // Attendee identity shown to the trainee. In normal mode the persona stays hidden (that's the
  // point of the exercise); with training wheels on it fills in as the trainee earns each detail.
  const roleRevealed = Boolean(trainingWheels && revealed?.role);
  const attendeeName = roleRevealed ? (revealed!.role as string) : "Conference Attendee";
  const attendeeSubtitle = roleRevealed
    ? revealed?.posture || "at the Honeycomb booth"
    : trainingWheels
      ? "Uncover who they are as you talk"
      : "At the Honeycomb booth";
  const avatarInitial = roleRevealed ? attendeeName.charAt(0).toUpperCase() : "?";
  const band = bandForScore(momentumScore);
  const traineeTurns = messages.filter((m) => m.type === "trainee").length;

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-screen">
        {/* Attendee identity header */}
        <div className="sticky top-0 z-10 bg-[var(--hc-page,#1e2734)]/95 backdrop-blur-sm border-b border-white/10 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center shrink-0"
              style={{ width: 44, height: 44, background: "#0278cd", clipPath: HEX_CLIP }}
            >
              <span className="text-white font-semibold text-lg leading-none">{avatarInitial}</span>
            </div>
            <div className="min-w-0">
              <div className="font-display font-semibold text-white text-lg leading-tight truncate">
                {attendeeName}
              </div>
              <div className="text-sm text-white/60 truncate">{attendeeSubtitle}</div>
            </div>
            <div className="ml-auto flex items-center gap-3 shrink-0">
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${BAND_STYLE[band]}`}
                title="How receptive the attendee is right now"
              >
                {band}
              </span>
              <span className="text-sm text-white/50">Turn {traineeTurns}</span>
            </div>
          </div>
        </div>

        {/* Training-wheels reveal panel */}
        {trainingWheels && (
          <div className="rounded-lg border p-4 mb-4" style={{ borderColor: "rgba(255,176,0,0.3)", background: "rgba(255,176,0,0.06)" }}>
            <div className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: "#ffb000" }}>
              Training wheels · what you&apos;ve uncovered
            </div>
            {(() => {
              const hasAny =
                revealed &&
                (revealed.role || (revealed.pains && revealed.pains.length) || revealed.posture || revealed.tooling || revealed.otel);
              if (!hasAny) {
                return (
                  <p className="text-sm text-gray-400">
                    Nothing yet — keep asking about their role and what&apos;s slowing them down. Details unlock as you earn their trust.
                  </p>
                );
              }
              return (
                <div className="flex flex-col gap-1.5 text-sm">
                  {revealed?.role && (
                    <div><span className="text-gray-400">Role:</span> <span className="text-gray-100">{revealed.role}</span></div>
                  )}
                  {revealed?.pains && revealed.pains.length > 0 && (
                    <div>
                      <span className="text-gray-400">Top frustrations:</span>
                      <ul className="mt-1 space-y-1">
                        {revealed.pains.map((p, i) => (
                          <li key={i} className="text-gray-100 flex gap-2"><span style={{ color: "#ffb000" }}>•</span>{p}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {revealed?.posture && (
                    <div><span className="text-gray-400">Mood:</span> <span className="text-gray-100">{revealed.posture}</span></div>
                  )}
                  {revealed?.tooling && (
                    <div><span className="text-gray-400">Tooling lean:</span> <span className="text-gray-100">{revealed.tooling}</span></div>
                  )}
                  {revealed?.otel && (
                    <div><span className="text-gray-400">OpenTelemetry:</span> <span className="text-gray-100">{revealed.otel}</span></div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* Chat panel - scrollable */}
        <div className="flex-1 overflow-y-auto rounded-lg border border-white/15 bg-white/7 p-4 shadow-sm">
          {messages.length === 0 ? (
            <div className="text-gray-500 text-center py-20">
              {loading ? "Loading session..." : "No messages yet"}
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((m) => {
                if (m.type === "system") {
                  return (
                    <div key={m.id} className="flex justify-center py-1">
                      <span className="text-[11px] uppercase tracking-wide text-white/30">
                        {m.text}
                      </span>
                    </div>
                  );
                }
                const isTrainee = m.type === "trainee";
                return (
                  <div
                    key={m.id}
                    className={`flex items-end gap-2 ${isTrainee ? "justify-end" : "justify-start"}`}
                  >
                    {!isTrainee && (
                      <div
                        className="shrink-0 mb-1"
                        style={{ width: 22, height: 22, background: "#0278cd", clipPath: HEX_CLIP }}
                        aria-hidden
                      />
                    )}
                    <div
                      className={`max-w-[78%] rounded-2xl px-4 py-2.5 whitespace-pre-wrap ${
                        isTrainee
                          ? "bg-[#0278cd] text-white rounded-br-sm"
                          : "bg-white/[0.06] border border-white/10 text-gray-100 rounded-bl-sm"
                      }`}
                    >
                      {m.text}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Completion CTA (when outcome reached) */}
        {endPrompt && sessionId && (
          <div className="bg-emerald-500/10 border border-emerald-400/20 rounded-lg p-4 space-y-3">
            <div className="text-sm text-emerald-200 font-medium">
              ✓ Looks like you've reached an outcome. Finish the interaction:
            </div>
            <BrandButton
              onClick={handleCompleteSession}
              disabled={loading}
              variant="lime"
              className="w-full justify-center text-base"
              title={endPrompt.tooltip}
            >
              {endPrompt.actionLabel}
            </BrandButton>
            <div className="text-xs text-emerald-200/70 text-center">
              Ready to complete this interaction
            </div>
          </div>
        )}

        {/* Fixed Input at Bottom - Hide when CTA is showing */}
        {!endPrompt && (
          <div className="sticky bottom-0 bg-[var(--hc-page,#1e2734)]/95 backdrop-blur-sm border-t border-white/10 pt-4 mt-4">
            <div className="flex items-center gap-3">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={sessionId ? "Type your response..." : "Loading..."}
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
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-400">{loading ? "Working…" : ""}</span>
              <button
                onClick={handleEndSession}
                disabled={!sessionId || loading}
                className="text-sm rounded-md border border-[#e65b53]/50 text-[#e65b53] px-3 py-1.5 hover:bg-[#e65b53]/10 transition disabled:opacity-50"
              >
                End session &amp; score
              </button>
            </div>
          </div>
        )}
      </div>
  );
}
