"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Layers, RotateCcw, Shuffle } from "lucide-react";
import { faqSections, faqToCards, type FaqCard } from "@/lib/quiz/faqCards";

/**
 * Flashcards for the Booth FAQ. Derived from the same FAQ markdown the study guide renders, so
 * the deck can't drift from the answers trainees are taught. "Got it" / "Review again" progress is
 * a per-browser convenience (localStorage, best effort), not a record anyone else sees.
 */

const STORE_KEY = "booth-faq-flashcards";
type Mark = "got" | "review";

function loadMarks(): Record<string, Mark> {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
function saveMarks(marks: Record<string, Mark>) {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(marks));
  } catch {
    /* private window or blocked storage: progress just doesn't persist */
  }
}

function shuffled<T>(list: T[]): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** **bold** and bare https:// links, matching the FAQ renderer on the study page. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*|https:\/\/[^\s,)]+)/g).map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i} className="text-white">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("https://")) {
          return (
            <a key={i} href={part} target="_blank" rel="noreferrer" className="text-[#7cc6f2] underline-offset-2 hover:underline break-all">
              {part.replace(/^https:\/\/(www\.)?/, "")}
            </a>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
}

function Answer({ lines }: { lines: string[] }) {
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (!bullets.length) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="ml-4 list-disc space-y-1">
        {bullets.map((b, i) => <li key={i}><Inline text={b} /></li>)}
      </ul>
    );
    bullets = [];
  };
  for (const line of lines) {
    if (line.startsWith("- ")) { bullets.push(line.slice(2)); continue; }
    flush();
    blocks.push(<p key={`p-${blocks.length}`}><Inline text={line} /></p>);
  }
  flush();
  return <div className="flex flex-col gap-2 text-[15px] leading-relaxed text-white/85">{blocks}</div>;
}

export function Flashcards({ faqMarkdown }: { faqMarkdown: string | null }) {
  const all = useMemo(() => faqToCards(faqMarkdown), [faqMarkdown]);
  const sections = useMemo(() => faqSections(all), [all]);

  const [section, setSection] = useState<string | null>(null); // null = all
  const [reviewOnly, setReviewOnly] = useState(false);
  const [order, setOrder] = useState<string[]>([]);
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [marks, setMarks] = useState<Record<string, Mark>>({});

  // Saved marks are read after hydration (the server has no localStorage), on the next frame so
  // the first client render matches the server's.
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setMarks(loadMarks()));
    return () => window.cancelAnimationFrame(id);
  }, []);

  const inScope = useMemo(() => all.filter((c) => !section || c.section === section), [all, section]);

  const startPass = useCallback((opts: { shuffle?: boolean; reviewOnly?: boolean; scope?: FaqCard[] } = {}) => {
    const ro = opts.reviewOnly ?? false;
    const scope = opts.scope ?? inScope;
    let ids = scope.filter((c) => !ro || marks[c.id] === "review").map((c) => c.id);
    if (opts.shuffle) ids = shuffled(ids);
    setReviewOnly(ro);
    setOrder(ids);
    setPos(0);
    setFlipped(false);
  }, [inScope, marks]);

  const pickSection = (s: string | null) => {
    setSection(s);
    startPass({ scope: all.filter((c) => !s || c.section === s) });
  };

  const byId = useMemo(() => new Map(all.map((c) => [c.id, c])), [all]);
  // Before any pass has been started, the deck is everything in scope, in FAQ order.
  const activeOrder = order.length || !inScope.length ? order : inScope.map((c) => c.id);
  const card: FaqCard | undefined = byId.get(activeOrder[pos]);
  const finished = activeOrder.length === 0 || pos >= activeOrder.length;
  const got = inScope.filter((c) => marks[c.id] === "got").length;
  const review = inScope.filter((c) => marks[c.id] === "review").length;

  const mark = useCallback((m: Mark) => {
    if (!card) return;
    const next = { ...marks, [card.id]: m };
    setMarks(next);
    saveMarks(next);
    setFlipped(false);
    setPos((p) => p + 1);
  }, [card, marks]);

  const go = useCallback((delta: number) => {
    setFlipped(false);
    setPos((p) => Math.min(Math.max(0, p + delta), activeOrder.length));
  }, [activeOrder.length]);

  const resetProgress = () => {
    const next = { ...marks };
    for (const c of inScope) delete next[c.id];
    setMarks(next);
    saveMarks(next);
    startPass();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      // Only when the deck is on screen, so the page's other sections aren't hijacked.
      const el = document.getElementById("flashcards");
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "1" && !finished) mark("got");
      else if (e.key === "2" && !finished) mark("review");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, mark, finished]);

  if (all.length === 0) {
    return <p className="text-sm text-white/50">The flashcards come from the Booth FAQ, which isn&apos;t available right now.</p>;
  }

  const chip = (label: string, active: boolean, onClick: () => void) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-sm transition ${
        active ? "border-[#0298ec] bg-[#0298ec] text-white" : "border-white/15 text-white/70 hover:border-[#0298ec] hover:text-white"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Sections">
        {chip("All", section === null, () => pickSection(null))}
        {sections.map((s) => chip(s.replace(/ Questions$/, ""), section === s, () => pickSection(s)))}
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[13px] text-white/60">
        <span>
          <strong className="text-white tabular-nums">{Math.min(pos + 1, activeOrder.length)}</strong> / <strong className="text-white tabular-nums">{activeOrder.length}</strong>
          {reviewOnly ? " in the review pile" : " cards"}
        </span>
        <span>
          <strong className="text-[#9ede5a] tabular-nums">{got}</strong> got it · <strong className="text-[#f5b84b] tabular-nums">{review}</strong> to review
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-white/10" aria-hidden>
        <div className="h-full rounded-full bg-[#64ba00] transition-[width] duration-300" style={{ width: inScope.length ? `${(100 * got) / inScope.length}%` : 0 }} />
      </div>

      {finished || !card ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/20 px-5 py-8 text-center">
          <h3 className="font-display text-lg font-semibold text-white">Pass complete</h3>
          <p className="text-sm text-white/65">
            {got} of {inScope.length} marked &ldquo;got it&rdquo;{section ? ` in ${section}` : ""}.{" "}
            {review ? `${review} still to review.` : "Review pile is empty."}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {review > 0 && (
              <button type="button" onClick={() => startPass({ shuffle: true, reviewOnly: true })} className="rounded-md bg-[#0278cd] hover:bg-[#0066ba] px-4 py-2 text-sm font-semibold text-white">
                Go through the review pile
              </button>
            )}
            <button type="button" onClick={() => startPass({ shuffle: true })} className="rounded-md border border-white/20 px-4 py-2 text-sm text-white hover:border-[#0298ec]">
              Start over, shuffled
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setFlipped((f) => !f)}
          aria-label={flipped ? "Answer shown. Press to see the question." : "Question shown. Press to reveal the answer."}
          className="group relative w-full rounded-xl border border-white/15 bg-black/25 text-left outline-none transition hover:border-[#0298ec]/70 focus-visible:border-[#0298ec]"
          style={{ minHeight: 240 }}
        >
          <div className="flex h-full min-h-[240px] flex-col gap-3 p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-wide">
              <span className="text-[#7cc6f2]">{flipped ? "What to say" : card.section.replace(/ Questions$/, "")}</span>
              {marks[card.id] && (
                <span className={marks[card.id] === "got" ? "text-[#9ede5a]" : "text-[#f5b84b]"}>
                  {marks[card.id] === "got" ? "got it" : "review"}
                </span>
              )}
            </div>
            {flipped ? (
              <>
                <Answer lines={card.answer} />
                {card.source && <p className="mt-auto pt-2 text-xs text-white/40 break-words">Source: <Inline text={card.source} /></p>}
              </>
            ) : (
              <p className="font-display text-xl font-semibold leading-snug text-white sm:text-2xl" style={{ textWrap: "balance" }}>
                {card.question}
              </p>
            )}
            <span className="absolute bottom-3 right-4 text-[11px] text-white/35 group-hover:text-white/60">
              {flipped ? "tap to flip back" : "tap to reveal"}
            </span>
          </div>
        </button>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => go(-1)} disabled={pos === 0} className="rounded-md border border-white/15 px-3 py-2 text-sm text-white disabled:opacity-40 hover:border-[#0298ec]">← Prev</button>
          <button type="button" onClick={() => go(1)} disabled={finished} className="rounded-md border border-white/15 px-3 py-2 text-sm text-white disabled:opacity-40 hover:border-[#0298ec]">Next →</button>
          <button type="button" onClick={() => startPass({ shuffle: true })} className="inline-flex items-center gap-1.5 rounded-md border border-white/15 px-3 py-2 text-sm text-white hover:border-[#0298ec]">
            <Shuffle size={14} aria-hidden /> Shuffle
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => mark("review")} disabled={finished} className="rounded-md border border-[#f5b84b]/50 px-3.5 py-2 text-sm font-medium text-[#f5b84b] disabled:opacity-40 hover:bg-[#f5b84b]/10">Review again</button>
          <button type="button" onClick={() => mark("got")} disabled={finished} className="rounded-md border border-[#64ba00]/60 px-3.5 py-2 text-sm font-medium text-[#9ede5a] disabled:opacity-40 hover:bg-[#64ba00]/10">Got it ✓</button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-white/40">
        <span>Keys: ← → move · 1 got it · 2 review. Progress is saved in this browser only.</span>
        <button type="button" onClick={resetProgress} className="inline-flex items-center gap-1 hover:text-white/70">
          <RotateCcw size={11} aria-hidden /> Reset {section ? "this section" : "all"}
        </button>
      </div>
    </div>
  );
}

/** The highlighted pointer at the top of the study guide. */
export function FlashcardsCallout({ count }: { count: number }) {
  return (
    <a
      href="#flashcards"
      className="group flex items-center gap-4 rounded-2xl border border-[#0298ec]/60 bg-gradient-to-r from-[#0298ec]/20 to-[#64ba00]/10 p-4 sm:p-5 transition hover:border-[#0298ec] outline-none focus-visible:border-white"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#0298ec] text-white shadow-lg shadow-[#0298ec]/30">
        <Layers size={22} aria-hidden />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-display text-base font-semibold text-white">New: Booth FAQ flashcards</span>
          <span className="rounded-full bg-[#64ba00] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#0f1a0a]">New</span>
        </span>
        <span className="text-sm text-white/70">
          {count ? `${count} cards, ` : ""}straight from the FAQ below. Flip, mark what you know, and drill the rest before the quiz.
        </span>
      </span>
      <span className="ml-auto hidden text-sm font-medium text-[#7cc6f2] sm:block group-hover:text-white">Start →</span>
    </a>
  );
}
