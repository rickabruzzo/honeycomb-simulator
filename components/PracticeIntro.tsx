"use client";

import React from "react";
import { OutcomesGrid } from "./quiz/CoachingContent";

/**
 * The short "ready" popup right before the conversation. The how-to coaching and the six-score
 * explainer live in the study guide (/study) and are covered by the quiz, so this only restates
 * the role and what a good ending looks like.
 */
export function PracticeIntro({ onStart }: { onStart: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl">
        <div className="rounded-2xl border border-white/15 bg-white/7 p-6 sm:p-7 shadow-sm flex flex-col gap-5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/40">
            Practice · ready when you are
          </span>
          <h1 className="font-display text-2xl font-semibold text-white">You&apos;re staffing the Honeycomb booth</h1>
          <p className="text-sm leading-relaxed text-white/70">
            You&apos;re the <strong className="text-white">greeter</strong>: welcome them, get to know them, and land the
            right next step. You&apos;re <strong className="text-white">not</strong> expected to be the technical or
            pricing expert. Here&apos;s the short version of what a good ending looks like.
          </p>
          <OutcomesGrid />
          <p className="text-sm leading-relaxed text-white/60">
            The attendee is simulated. Have a natural conversation, then end the session for your scorecard and
            coaching.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <a href="/study?trainee=1" target="_blank" rel="noreferrer" className="text-sm text-white/60 hover:text-white transition">
              Revisit the study guide
            </a>
            <button
              onClick={onStart}
              className="inline-flex items-center gap-2 rounded-md bg-[#0278cd] hover:bg-[#0066ba] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition"
            >
              Start conversation →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
