"use client";

import React, { useEffect, useRef, useState } from "react";
import { Bot, Download, Save, Copy, X, Loader2 } from "lucide-react";
import { downloadSessionExport, type ReviewPayload } from "../lib/sessionExport";

/**
 * Admin dialog: send a finished session to the AI reviewer, read/edit what it says, then
 * optionally save it as the session's trainer note or download the transcript.
 *
 * The reviewer output lands in an editable textarea on purpose - an admin usually trims it to
 * the part worth keeping before saving.
 */
export function AiReviewDialog({
  sessionId,
  token,
  traineeName,
  onClose,
}: {
  sessionId: string;
  token: string;
  traineeName: string;
  onClose: () => void;
}) {
  const [focus, setFocus] = useState("");
  const [review, setReview] = useState("");
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const firstField = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    firstField.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const runReview = async () => {
    setRunning(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/sessions/${sessionId}/ai-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ focus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setReview(data.review);
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof Error ? e.message : "AI review failed" });
    } finally {
      setRunning(false);
    }
  };

  const saveNote = async () => {
    if (!review.trim()) return;
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/session/${sessionId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guidance: review.trim(), updatedBy: "ai-review" }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      setStatus({ kind: "ok", text: "Saved as this session's trainer note." });
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  const copyReview = async () => {
    try {
      await navigator.clipboard.writeText(review);
      setStatus({ kind: "ok", text: "Copied." });
    } catch {
      setStatus({ kind: "error", text: "Clipboard is blocked in this browser." });
    }
  };

  const downloadTranscript = async () => {
    setStatus(null);
    try {
      const res = await fetch(`/api/review/${token}`);
      if (!res.ok) throw new Error(`Could not load transcript (${res.status})`);
      downloadSessionExport((await res.json()) as ReviewPayload);
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof Error ? e.message : "Download failed" });
    }
  };

  const btn =
    "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition disabled:opacity-40";
  const ghost = `${btn} border-white/15 bg-white/[0.07] text-gray-100 hover:border-[#0298ec]/45 hover:bg-[#0278cd]/25 hover:text-white`;
  const primary = `${btn} border-[#0298ec]/60 bg-[#0278cd] text-white hover:bg-[#0298ec]`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-review-title"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg border border-white/15 bg-[#25303e] shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <h2 id="ai-review-title" className="flex items-center gap-2 text-sm font-semibold text-white">
            <Bot size={16} /> AI review · {traineeName}
          </h2>
          <button onClick={onClose} title="Close" className="text-gray-400 hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
          <p className="text-xs text-gray-400">
            Sends the transcript and current score to the AI reviewer. It checks how the simulated
            attendee behaved, whether the grade was fair, and drafts coaching. Nothing is saved
            unless you save it.
          </p>

          <label className="flex flex-col gap-1.5 text-xs text-gray-300">
            <span>
              What should it look at? <span className="text-gray-500">(optional)</span>
            </span>
            <textarea
              ref={firstField}
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              rows={2}
              placeholder="e.g. Was listening scored too low? Did the attendee ignore the demo offer?"
              className="rounded-md border border-white/15 bg-black/20 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:border-[#0298ec]/60 focus:outline-none"
            />
          </label>

          <div className="flex items-center gap-2">
            <button onClick={runReview} disabled={running} className={primary}>
              {running ? <Loader2 size={13} className="animate-spin" /> : <Bot size={13} />}
              {running ? "Reviewing…" : review ? "Run again" : "Run AI review"}
            </button>
            <button onClick={downloadTranscript} className={ghost} title="Download the transcript as JSON">
              <Download size={13} /> Transcript
            </button>
          </div>

          {(review || running) && (
            <label className="flex flex-col gap-1.5 text-xs text-gray-300">
              <span>
                Feedback <span className="text-gray-500">(editable before you save)</span>
              </span>
              <textarea
                value={review}
                onChange={(e) => setReview(e.target.value)}
                rows={14}
                disabled={running}
                className="rounded-md border border-white/15 bg-black/20 px-3 py-2 text-[13px] leading-relaxed text-gray-100 focus:border-[#0298ec]/60 focus:outline-none disabled:opacity-50"
              />
            </label>
          )}

          {status && (
            <p className={`text-xs ${status.kind === "ok" ? "text-[#9ede5a]" : "text-[#e88079]"}`}>
              {status.text}
            </p>
          )}
        </div>

        {review && (
          <div className="flex items-center justify-end gap-2 border-t border-white/10 px-5 py-3">
            <button onClick={copyReview} className={ghost}>
              <Copy size={13} /> Copy
            </button>
            <button
              onClick={saveNote}
              disabled={saving || !review.trim()}
              className={primary}
              title="Replaces any trainer note already on this session"
            >
              <Save size={13} /> {saving ? "Saving…" : "Save as trainer note"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
