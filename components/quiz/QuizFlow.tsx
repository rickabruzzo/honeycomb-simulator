"use client";

import React, { useCallback, useEffect, useState } from "react";
import type { ClientQuestion, QuizResult, QuizSource } from "../../lib/quiz/types";

/**
 * The study-guide quiz that gates the simulator: an intro popup (with study links), one question
 * at a time with "why" feedback on a miss, then a Honeycomb leader delivers the grade. Answers are
 * checked server-side; the client never learns which choice is right until it has answered.
 */

const HEX_CLIP = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";
const GRADE_COLOR: Record<string, string> = {
  A: "#64ba00",
  B: "#0298ec",
  C: "#ffb000",
  D: "#f96e10",
  F: "#e65b53",
};
const KEYS = "ABCD";

interface Status {
  required: boolean;
  passed: boolean;
  questionsPerAttempt?: number;
  passPercent?: number;
  sources?: QuizSource[];
}

interface Verdict {
  pos: number;
  correct: boolean;
  correctPos: number;
  whyNot: string | null;
  whyBest: string;
}

type Phase = "intro" | "quiz" | "result";

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/7 p-6 sm:p-7 shadow-sm flex flex-col gap-5">
      {children}
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/40">{children}</span>;
}

function passMark(total: number, percent: number) {
  return Math.ceil((total * percent) / 100);
}

export function QuizFlow({
  token,
  status,
  onUnlocked,
}: {
  token: string;
  status: Status;
  onUnlocked: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ClientQuestion[]>([]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [right, setRight] = useState(0);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = status.questionsPerAttempt ?? 15;
  const passPct = status.passPercent ?? 65;
  const sources = status.sources ?? [];

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/quiz/${token}`, { method: "POST" });
      if (!res.ok) throw new Error(`start failed: ${res.status}`);
      const data = await res.json();
      setAttemptId(data.attemptId);
      setQuestions(data.questions);
      setI(0);
      setPicked(null);
      setVerdict(null);
      setRight(0);
      setResult(null);
      setPhase("quiz");
      window.scrollTo(0, 0);
    } catch (e) {
      console.error(e);
      setError("Couldn't load the quiz. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }, [token]);

  const check = async () => {
    if (picked === null || !attemptId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/quiz/${token}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId, index: i, pos: picked }),
      });
      if (res.status === 409) {
        setError("The quiz was just updated. Starting a fresh attempt.");
        await start();
        return;
      }
      if (!res.ok) throw new Error(`answer failed: ${res.status}`);
      const data = await res.json();
      setVerdict({ pos: picked, ...data });
      if (data.correct) setRight((r) => r + 1);
      if (data.result) setResult(data.result);
    } catch (e) {
      console.error(e);
      setError("Couldn't check that answer. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    if (i < questions.length - 1) {
      setI(i + 1);
      setPicked(null);
      setVerdict(null);
      window.scrollTo(0, 0);
    } else {
      setPhase("result");
      window.scrollTo(0, 0);
    }
  };

  // Enter = check / next, 1-4 or A-D = pick.
  useEffect(() => {
    if (phase !== "quiz") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!verdict) {
        const k = e.key.toUpperCase();
        const n = "1234".indexOf(k) >= 0 ? "1234".indexOf(k) : KEYS.indexOf(k);
        if (n >= 0 && n < (questions[i]?.choices.length ?? 0)) setPicked(n);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, verdict, questions, i]);

  return (
    <div className="min-h-screen flex items-start sm:items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl">
        {phase === "intro" && (
          <Card>
            <Eyebrow>Before you practice</Eyebrow>
            <h1 className="font-display text-2xl font-semibold text-white">Booth study guide</h1>
            <p className="text-sm leading-relaxed text-white/65">
              A short quiz on what makes booth conversations go well: answering the common questions, spotting
              the real pain, reading when someone&apos;s ready for a next step, and knowing what to hand off.{" "}
              <strong className="font-medium text-white">Get a C or better to unlock the simulator.</strong> Miss
              one and you&apos;ll see why the better answer works.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {[
                [String(total), "multiple-choice questions"],
                [`${passMark(total, passPct)}/${total}`, "to pass (a C)"],
                ["∞", "retakes, it's practice"],
              ].map(([n, l]) => (
                <div key={l} className="rounded-lg border border-white/15 p-3">
                  <div className="font-display text-2xl font-bold text-white tabular-nums">{n}</div>
                  <div className="text-xs text-white/60">{l}</div>
                </div>
              ))}
            </div>
            {sources.length > 0 && (
              <div className="flex flex-col gap-2">
                <h2 className="font-display text-xs font-semibold uppercase tracking-wide text-white/50">
                  Study first (optional)
                </h2>
                <ul className="flex flex-col gap-2">
                  {sources.map((s) => (
                    <li key={s.title}>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between gap-3 rounded-lg border border-white/15 bg-black/20 px-3.5 py-2.5 text-sm text-white hover:border-[#0298ec] focus-visible:border-[#0298ec] outline-none"
                      >
                        <span>{s.title}</span>
                        {s.note && <small className="text-xs text-white/40 text-right">{s.note}</small>}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {error && <p className="text-sm text-[#e65b53]">{error}</p>}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-white/40">Study links open in a new tab.</span>
              <button
                onClick={start}
                disabled={busy}
                className="rounded-md bg-[#0278cd] hover:bg-[#0066ba] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Loading…" : "Start quiz →"}
              </button>
            </div>
          </Card>
        )}

        {phase === "quiz" && questions[i] && (
          <QuestionCard
            q={questions[i]}
            total={questions.length}
            picked={picked}
            verdict={verdict}
            right={right}
            busy={busy}
            error={error}
            onPick={(n) => !verdict && setPicked(n)}
            onCheck={check}
            onNext={next}
            isLast={i === questions.length - 1}
          />
        )}

        {phase === "result" && result && (
          <ResultCard result={result} onRetake={start} onContinue={onUnlocked} busy={busy} />
        )}
      </div>
    </div>
  );
}

function QuestionCard({
  q,
  total,
  picked,
  verdict,
  right,
  busy,
  error,
  onPick,
  onCheck,
  onNext,
  isLast,
}: {
  q: ClientQuestion;
  total: number;
  picked: number | null;
  verdict: Verdict | null;
  right: number;
  busy: boolean;
  error: string | null;
  onPick: (n: number) => void;
  onCheck: () => void;
  onNext: () => void;
  isLast: boolean;
}) {
  const progress = ((q.index + (verdict ? 1 : 0)) / total) * 100;
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10" aria-hidden>
          <div className="h-full rounded-full bg-[#64ba00] transition-all" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-xs font-medium text-white/60 tabular-nums whitespace-nowrap">
          Question {q.index + 1} of {total}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="rounded-full border border-[#0298ec]/40 bg-[#0298ec]/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#7cc6f2]">
          {q.moduleTitle}
        </span>
        {q.persona && (
          <span className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/60">
            {q.persona}
          </span>
        )}
      </div>

      {q.attendee && (
        <div className="flex items-start gap-3">
          <span
            className="grid shrink-0 place-items-center bg-[#25303e] text-sm font-semibold text-white/60"
            style={{ width: 34, height: 38, clipPath: HEX_CLIP }}
            aria-hidden
          >
            ?
          </span>
          <div className="max-w-prose rounded-[4px_14px_14px_14px] border border-white/15 bg-[#25303e] px-3.5 py-3 text-[15px] text-white">
            &ldquo;{q.attendee}&rdquo;
          </div>
        </div>
      )}

      {q.transcript && q.transcript.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {q.transcript.map((line, n) => {
            const you = line.who === "you";
            return (
              <div key={n} className={`flex ${you ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[85%]">
                  <div className={`mb-1 text-[11px] uppercase tracking-wide text-white/40 ${you ? "text-right" : ""}`}>
                    {you ? "Greeter" : "Attendee"}
                  </div>
                  <div
                    className={`rounded-2xl px-3.5 py-2.5 text-[15px] ${
                      you
                        ? "rounded-br-sm bg-[#0278cd]/80 text-white"
                        : "rounded-bl-sm border border-white/15 bg-[#25303e] text-white"
                    }`}
                  >
                    {line.text}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p id={`prompt-${q.index}`} className="font-display text-[17px] font-semibold leading-snug text-white">
        {q.prompt}
      </p>

      <ul className="flex flex-col gap-2.5" role="radiogroup" aria-labelledby={`prompt-${q.index}`}>
        {q.choices.map((text, n) => {
          let tone = "border-white/15 bg-black/20 hover:border-white/35";
          let key = "bg-white/10 text-white/60";
          if (verdict) {
            if (n === verdict.correctPos) {
              tone = "border-[#64ba00] bg-[#64ba00]/12";
              key = "bg-[#64ba00] text-[#1b2a00]";
            } else if (n === verdict.pos) {
              tone = "border-[#e65b53] bg-[#e65b53]/12";
              key = "bg-[#e65b53] text-white";
            } else {
              tone = "border-white/15 bg-black/20 opacity-45";
            }
          } else if (picked === n) {
            tone = "border-[#0298ec] bg-[#0298ec]/12";
          }
          return (
            <li key={n}>
              <button
                type="button"
                role="radio"
                aria-checked={picked === n}
                disabled={Boolean(verdict)}
                onClick={() => onPick(n)}
                className={`flex w-full gap-3 rounded-lg border px-3.5 py-3 text-left text-[14.5px] leading-normal text-white transition outline-none focus-visible:ring-2 focus-visible:ring-[#0298ec] ${tone} ${
                  verdict ? "cursor-default" : "cursor-pointer"
                }`}
              >
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md font-display text-xs font-semibold ${key}`}>
                  {KEYS[n]}
                </span>
                <span>{text}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {verdict && (
        <div
          className={`flex flex-col gap-2.5 rounded-xl border px-4 py-3.5 ${
            verdict.correct ? "border-[#64ba00]/35 bg-[#64ba00]/8" : "border-[#e65b53]/35 bg-[#e65b53]/8"
          }`}
          aria-live="polite"
        >
          {verdict.correct ? (
            <>
              <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-[#9ede5a]">
                Right. Here&apos;s why it works
              </h3>
              <p className="text-sm leading-relaxed text-white/85">{verdict.whyBest}</p>
            </>
          ) : (
            <>
              <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-[#f19a94]">
                Why your pick isn&apos;t the best move
              </h3>
              <p className="text-sm leading-relaxed text-white/85">{verdict.whyNot}</p>
              <h3 className="mt-1 font-display text-xs font-semibold uppercase tracking-wide text-[#9ede5a]">
                Why {KEYS[verdict.correctPos]} is better
              </h3>
              <p className="text-sm leading-relaxed text-white/85">{verdict.whyBest}</p>
            </>
          )}
        </div>
      )}

      {error && <p className="text-sm text-[#e65b53]">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-white/40 tabular-nums">{right} right on first try</span>
        {verdict ? (
          <button
            onClick={onNext}
            className="rounded-md bg-[#0278cd] hover:bg-[#0066ba] px-5 py-2.5 text-sm font-semibold text-white"
            autoFocus
          >
            {isLast ? "See your grade →" : verdict.correct ? "Next question →" : "Got it, next question →"}
          </button>
        ) : (
          <button
            onClick={onCheck}
            disabled={picked === null || busy}
            className="rounded-md bg-[#0278cd] hover:bg-[#0066ba] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? "Checking…" : "Check answer"}
          </button>
        )}
      </div>
    </Card>
  );
}

function ResultCard({
  result,
  onRetake,
  onContinue,
  busy,
}: {
  result: QuizResult;
  onRetake: () => void;
  onContinue: () => void;
  busy: boolean;
}) {
  const color = GRADE_COLOR[result.grade];
  const [portraitOk, setPortraitOk] = useState(true);
  return (
    <Card>
      <Eyebrow>Your grade</Eyebrow>
      <div className="grid grid-cols-1 sm:grid-cols-[240px_1fr] items-center gap-6">
        <div className="relative aspect-[320/214] overflow-hidden rounded-lg border-2 border-white/15 bg-black">
          {result.leader.id && portraitOk ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/quiz/leader/${result.leader.id}`}
              alt={`Pixel portrait of ${result.leader.name}`}
              className="h-full w-full object-cover"
              style={{ imageRendering: "pixelated" }}
              onError={() => setPortraitOk(false)}
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-white/30 text-sm">Honeycomb</div>
          )}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: "repeating-linear-gradient(0deg, rgba(0,0,0,.16) 0 1px, transparent 1px 3px)" }}
            aria-hidden
          />
        </div>
        <div className="flex min-w-0 flex-col gap-3.5">
          {result.leader.name && (
            <div className="font-display text-[15px] font-semibold text-white">
              {result.leader.name}
              <small className="block font-sans text-xs font-normal text-white/60">{result.leader.title}</small>
            </div>
          )}
          <p className="border-l-[3px] border-[#ffb000] pl-3 text-sm leading-relaxed text-white">
            &ldquo;{result.leader.line}&rdquo;
          </p>
          <div className="flex items-center gap-4">
            <div
              className="grid place-items-center font-display text-3xl font-bold"
              style={{ width: 64, height: 72, clipPath: HEX_CLIP, background: color, color: result.grade === "C" ? "#2a1d00" : "#fff" }}
            >
              {result.grade}
            </div>
            <div className="font-display text-3xl font-bold tabular-nums text-white">
              {result.right}/{result.total}
              <small className="block font-sans text-[13px] font-normal text-white/60">{Math.round(result.percent)}% right on first try</small>
            </div>
          </div>
        </div>
      </div>

      <div
        className={`rounded-lg border px-3 py-2.5 text-[13px] ${
          result.passed
            ? "border-[#64ba00]/30 bg-[#64ba00]/10 text-[#9ede5a]"
            : "border-[#ffb000]/30 bg-[#ffb000]/8 text-[#ffd27a]"
        }`}
      >
        {result.passed
          ? "Simulator unlocked. You can come back to the study guide any time."
          : "You need a C to unlock the simulator. Retakes draw a fresh set of questions."}
      </div>

      {result.missed.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <h2 className="font-display text-xs font-semibold uppercase tracking-wide text-white/50">What you missed</h2>
          <ul className="flex flex-col gap-2">
            {result.missed.map((m, n) => (
              <li key={n} className="flex items-baseline gap-2.5 text-sm text-white/80">
                <span className="min-w-[112px] shrink-0 text-[11px] font-semibold uppercase tracking-wide text-[#f19a94]">
                  {m.moduleTitle}
                </span>
                <span className="line-clamp-2">&ldquo;{m.summary}&rdquo;</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <a href="/study?trainee=1" target="_blank" rel="noreferrer" className="text-sm text-white/60 hover:text-white">
          Open the study guide
        </a>
        <div className="flex gap-2">
          <button
            onClick={onRetake}
            disabled={busy}
            className={`rounded-md px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${
              result.passed ? "border border-white/15 bg-white/10 hover:bg-white/15" : "bg-[#0278cd] hover:bg-[#0066ba]"
            }`}
          >
            {busy ? "Loading…" : "Retake quiz"}
          </button>
          {result.passed && (
            <button
              onClick={onContinue}
              className="rounded-md bg-[#0278cd] hover:bg-[#0066ba] px-5 py-2.5 text-sm font-semibold text-white"
            >
              Continue to the simulator →
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}
