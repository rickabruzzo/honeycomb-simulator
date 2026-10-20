"use client";

import React, { useEffect, useState } from "react";
import { CoachingContent, OutcomesGrid, ScoringContent } from "@/components/quiz/CoachingContent";
import type { QuizSource } from "@/lib/quiz/types";

/**
 * The booth study guide: greeter coaching, how sessions are scored, the Booth FAQ, and links to
 * the launch docs. The FAQ and links come from the quiz bank (kept out of the repo), not this file.
 */

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 rounded-2xl border border-white/15 bg-white/7 p-6 sm:p-7 flex flex-col gap-4">
      <h2 className="font-display text-lg font-semibold text-white">{title}</h2>
      {children}
    </section>
  );
}

/** Just enough markdown for the FAQ: #/## headings, **bold** question lines, bullets, paragraphs. */
function FaqMarkdown({ source }: { source: string }) {
  const inline = (text: string) =>
    text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={i} className="text-white">{part.slice(2, -2)}</strong>
      ) : (
        <React.Fragment key={i}>{part}</React.Fragment>
      )
    );

  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="ml-4 list-disc space-y-1 text-sm text-white/75">
          {bullets.map((b, i) => <li key={i}>{inline(b)}</li>)}
        </ul>
      );
      bullets = [];
    }
  };
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (line.startsWith("# ")) { flush(); continue; } // page title; the section already has one
    if (line.startsWith("Source:")) { flush(); continue; } // authoring note, not for trainees
    if (line.startsWith("## ")) {
      flush();
      blocks.push(
        <h3 key={`h-${blocks.length}`} className="mt-3 font-display text-xs font-semibold uppercase tracking-wide text-white/50">
          {line.slice(3)}
        </h3>
      );
      continue;
    }
    if (/^[-*] /.test(line)) { bullets.push(line.slice(2)); continue; }
    flush();
    blocks.push(<p key={`p-${blocks.length}`} className="text-sm leading-relaxed text-white/75">{inline(line)}</p>);
  }
  flush();
  return <div className="flex flex-col gap-2.5">{blocks}</div>;
}

export default function StudyGuidePage() {
  const [faq, setFaq] = useState<string | null>(null);
  const [sources, setSources] = useState<QuizSource[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/quiz/study")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setFaq(d?.faqMarkdown ?? null);
        setSources(d?.sources ?? []);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const external = sources.filter((s) => /^https?:\/\//.test(s.url));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 pb-12">
      <header className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/40">Before you practice</span>
        <h1 className="font-display text-3xl font-semibold text-white">Booth study guide</h1>
        <p className="text-sm leading-relaxed text-white/65">
          Everything the quiz covers. You&apos;re a <strong className="text-white">greeter</strong>: welcome people, get
          to know them, answer at a high level, and land the right next step.
        </p>
        <nav className="mt-1 flex flex-wrap gap-2 text-sm">
          {[
            ["#coaching", "How to have the conversation"],
            ["#outcomes", "Good endings"],
            ["#scoring", "How you're scored"],
            ["#faq", "Booth FAQ"],
            ...(external.length ? [["#launch", "Launch docs"]] : []),
          ].map(([href, label]) => (
            <a key={href} href={href} className="rounded-full border border-white/15 px-3 py-1 text-white/70 hover:border-[#0298ec] hover:text-white">
              {label}
            </a>
          ))}
        </nav>
      </header>

      <Section id="coaching" title="How to have the conversation">
        <CoachingContent />
      </Section>

      <Section id="outcomes" title="Good endings: land the right one for this person">
        <OutcomesGrid />
      </Section>

      <Section id="scoring" title="How you're scored in the simulator">
        <p className="text-xs text-white/45">These guide your practice; they&apos;re not there to trip you up.</p>
        <ScoringContent />
      </Section>

      <Section id="faq" title="Booth FAQ">
        {faq ? (
          <FaqMarkdown source={faq} />
        ) : (
          <p className="text-sm text-white/50">{loaded ? "The FAQ isn't available right now." : "Loading…"}</p>
        )}
      </Section>

      {external.length > 0 && (
        <Section id="launch" title="Launch docs">
          <p className="text-sm text-white/60">Internal docs. You&apos;ll need to be signed in to Notion.</p>
          <ul className="flex flex-col gap-2">
            {external.map((s) => (
              <li key={s.url}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-3 rounded-lg border border-white/15 bg-black/20 px-3.5 py-2.5 text-sm text-white hover:border-[#0298ec]"
                >
                  <span>{s.title}</span>
                  {s.note && <small className="text-xs text-white/40">{s.note}</small>}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
