"use client";

import React, { useState } from "react";

/**
 * Two-screen onboarding the trainee sees before the conversation starts. This is a TRAINING tool,
 * so screen 1 coaches how to actually have the conversation and screen 2 explains what each score
 * means and what a good outcome looks like — setting the trainee up to succeed, not testing them.
 */

function Lead({ children }: { children: React.ReactNode }) {
  // A coaching item: a lime lead-in, then the explanation.
  return <li className="flex gap-3">{children}</li>;
}

function Dot() {
  return (
    <span
      className="mt-2 shrink-0 rounded-full"
      style={{ width: 6, height: 6, background: "#64ba00" }}
      aria-hidden
    />
  );
}

export function PracticeIntro({ onStart }: { onStart: () => void }) {
  const [step, setStep] = useState<0 | 1>(0);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl">
        {/* Progress */}
        <div className="mb-4 flex items-center gap-2">
          <span
            className="h-1.5 rounded-full transition-all"
            style={{ width: step === 0 ? 28 : 16, background: step === 0 ? "#64ba00" : "rgba(255,255,255,0.25)" }}
          />
          <span
            className="h-1.5 rounded-full transition-all"
            style={{ width: step === 1 ? 28 : 16, background: step === 1 ? "#64ba00" : "rgba(255,255,255,0.25)" }}
          />
          <span className="ml-auto text-xs uppercase tracking-wide text-white/40">
            Before you start · Practice
          </span>
        </div>

        <div className="rounded-2xl border border-white/15 bg-white/7 p-7 shadow-sm">
          {step === 0 ? (
            <>
              <h1 className="font-display text-2xl font-semibold text-white">
                You&apos;re staffing the Honeycomb booth
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-white/70">
                You&apos;re a <strong className="text-white">greeter</strong> — welcome the attendee, get
                to know them, and land the right next step. You&apos;re <strong className="text-white">not</strong>{" "}
                expected to be the technical or pricing expert, and there&apos;s no single &ldquo;right&rdquo;
                script. This is practice: try things, see how the attendee reacts, and learn what works.
              </p>

              <h2 className="mt-6 font-display text-sm font-semibold uppercase tracking-wide text-white/50">
                How to have this conversation
              </h2>
              <ul className="mt-3 space-y-3 text-sm leading-relaxed text-white/75">
                <Lead>
                  <Dot />
                  <span>
                    <strong className="text-white">Open warm and low-pressure.</strong> Greet them like a
                    person, not a prospect. &ldquo;What brings you by?&rdquo; beats a pitch. Let them set the pace.
                  </span>
                </Lead>
                <Lead>
                  <Dot />
                  <span>
                    <strong className="text-white">Get to know them first.</strong> Ask what they do and
                    what they&apos;re responsible for, then what they use today for monitoring/observability
                    and how that&apos;s working out. One question at a time — don&apos;t stack them.
                  </span>
                </Lead>
                <Lead>
                  <Dot />
                  <span>
                    <strong className="text-white">Listen — really listen.</strong> The most important
                    skill. Let them <em>finish</em> before you respond; don&apos;t latch onto one word and
                    start prepping your comeback while they&apos;re still talking. Reflect back what you
                    heard (&ldquo;so it sounds like you&apos;re stitching together five tools during an
                    incident?&rdquo;) so they know you got it.
                  </span>
                </Lead>
                <Lead>
                  <Dot />
                  <span>
                    <strong className="text-white">Commiserate before you sell.</strong> When they share a
                    frustration, empathize first — &ldquo;that sounds exhausting.&rdquo; People open up when
                    they feel heard, and that&apos;s when the real pain surfaces. A complaint is an invitation
                    to connect, not a cue to pitch.
                  </span>
                </Lead>
                <Lead>
                  <Dot />
                  <span>
                    <strong className="text-white">Dig into impact before solutions.</strong> Once you find
                    a pain, ask what it <em>costs</em> — time, stress, lost sleep, customer trust — before
                    mentioning any tool. Understanding the impact matters more than naming features.
                  </span>
                </Lead>
                <Lead>
                  <Dot />
                  <span>
                    <strong className="text-white">Answer questions honestly and simply.</strong> They&apos;ll
                    ask &ldquo;what is Honeycomb?&rdquo;, &ldquo;how are you different from [their tool]?&rdquo;,
                    &ldquo;what&apos;s it cost?&rdquo; — give a clear, plain-language answer; no jargon needed.
                    When it goes deep (implementation, OpenTelemetry rollout, exact pricing), that&apos;s your
                    cue to <strong className="text-white">hand off</strong>: &ldquo;great question — let me
                    connect you with our specialist.&rdquo;
                  </span>
                </Lead>
                <Lead>
                  <Dot />
                  <span>
                    <strong className="text-white">Read the fit, then route.</strong> Are they genuinely open
                    to a better way, or just browsing? That read tells you the right next step.
                  </span>
                </Lead>
              </ul>
            </>
          ) : (
            <>
              <h1 className="font-display text-2xl font-semibold text-white">How you&apos;ll do well</h1>

              <h2 className="mt-5 font-display text-sm font-semibold uppercase tracking-wide text-white/50">
                You&apos;re scored on six things
              </h2>
              <p className="mt-1 text-xs text-white/45">
                These guide your practice — they&apos;re not there to trip you up.
              </p>
              <ul className="mt-3 space-y-3 text-sm leading-relaxed text-white/75">
                <Lead>
                  <Dot />
                  <span>
                    <strong className="text-white">Discovery</strong> — how well you uncover their real
                    situation: their role, what they use today, what&apos;s not working, and what brought them
                    by. The best discovery comes from genuine, open-ended curiosity — not a checklist.
                  </span>
                </Lead>
                <Lead>
                  <Dot />
                  <span>
                    <strong className="text-white">Listening</strong> — whether you actually <em>heard</em>{" "}
                    them. Did you build on what they said, reflect it back, and follow the thread — rather than
                    talking over them or sticking to a script?
                  </span>
                </Lead>
                <Lead>
                  <Dot />
                  <span>
                    <strong className="text-white">Empathy</strong> — whether your responses fit the person and
                    made them feel heard. Real commiseration with their frustrations is what builds trust and
                    gets them to open up.
                  </span>
                </Lead>
                <Lead>
                  <Dot />
                  <span>
                    <strong className="text-white">Qualification &amp; Fit</strong> — whether you got a read on
                    who they are and whether there&apos;s a genuine fit: are they open to a better way, and
                    who&apos;s the right person to route them to? It&apos;s a read, not a push — not everyone
                    should get a demo.
                  </span>
                </Lead>
                <Lead>
                  <Dot />
                  <span>
                    <strong className="text-white">Staying in lane</strong> — whether you kept your answers
                    honest and high-level and handed off the deep technical or pricing questions instead of
                    winging it or over-promising. Knowing what <em>not</em> to answer is a skill.
                  </span>
                </Lead>
                <Lead>
                  <Dot />
                  <span>
                    <strong className="text-white">Next step</strong> — whether you landed the right next step{" "}
                    <em>for this person</em>, routing them well rather than forcing everyone down the same path.
                  </span>
                </Lead>
              </ul>

              <h2 className="mt-6 font-display text-sm font-semibold uppercase tracking-wide text-white/50">
                Winning outcomes — land the right one for this person
              </h2>
              <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-white/75">
                <Lead>
                  <Dot />
                  <span>
                    <strong className="text-white">Demo</strong> — hand off to a demo engineer (anyone genuinely interested).
                  </span>
                </Lead>
                <Lead>
                  <Dot />
                  <span>
                    <strong className="text-white">Sales follow-up</strong> (badge scan) — someone with buying authority.
                  </span>
                </Lead>
                <Lead>
                  <Dot />
                  <span>
                    <strong className="text-white">Self-serve</strong> (docs / free tier) — a self-directed learner who&apos;d rather explore alone.
                  </span>
                </Lead>
                <Lead>
                  <Dot />
                  <span>
                    <strong className="text-white">Polite exit</strong> — a perfectly good outcome when there&apos;s genuinely no fit.
                  </span>
                </Lead>
              </ul>

              <p className="mt-6 text-sm leading-relaxed text-white/60">
                The attendee is simulated — just have a natural conversation. When you&apos;re done, end the
                session to get your scorecard and coaching.
              </p>
            </>
          )}
        </div>

        {/* Footer nav */}
        <div className="mt-5 flex items-center justify-between gap-3">
          {step === 1 ? (
            <button
              onClick={() => setStep(0)}
              className="text-sm text-white/60 hover:text-white transition"
            >
              ← Back
            </button>
          ) : (
            <span />
          )}
          {step === 0 ? (
            <button
              onClick={() => setStep(1)}
              className="inline-flex items-center gap-2 rounded-md bg-white/10 hover:bg-white/15 border border-white/15 px-5 py-2.5 text-sm font-medium text-white transition"
            >
              Next →
            </button>
          ) : (
            <button
              onClick={onStart}
              className="inline-flex items-center gap-2 rounded-md bg-[#0278cd] hover:bg-[#0066ba] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition"
            >
              Start conversation →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
