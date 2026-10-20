import React from "react";

/**
 * Greeter coaching and the six-score explainer. These used to be the two-screen pre-practice
 * popup; they now live in the study guide (/study), and the quiz tests them.
 */

function Item({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-2 shrink-0 rounded-full" style={{ width: 6, height: 6, background: "#64ba00" }} aria-hidden />
      <span>
        <strong className="text-white">{title}</strong> {children}
      </span>
    </li>
  );
}

export function CoachingContent() {
  return (
    <ul className="space-y-3 text-sm leading-relaxed text-white/75">
      <Item title="Open warm and low-pressure.">
        Greet them like a person, not a prospect. &ldquo;What brings you by?&rdquo; beats a pitch. Let them set the pace.
      </Item>
      <Item title="Get to know them first.">
        Ask what they do and what they&apos;re responsible for, then what they use today for monitoring/observability
        and how that&apos;s working out. One question at a time; don&apos;t stack them.
      </Item>
      <Item title="Listen, really listen.">
        The most important skill. Let them <em>finish</em> before you respond; don&apos;t latch onto one word and start
        prepping your comeback while they&apos;re still talking. Reflect back what you heard (&ldquo;so it sounds like
        you&apos;re stitching together five tools during an incident?&rdquo;) so they know you got it.
      </Item>
      <Item title="Commiserate before you sell.">
        When they share a frustration, empathize first: &ldquo;that sounds exhausting.&rdquo; People open up when they
        feel heard, and that&apos;s when the real pain surfaces. A complaint is an invitation to connect, not a cue to
        pitch.
      </Item>
      <Item title="Dig into impact before solutions.">
        Once you find a pain, ask what it <em>costs</em> (time, stress, lost sleep, customer trust) before mentioning
        any tool. Understanding the impact matters more than naming features.
      </Item>
      <Item title="Answer questions honestly and simply.">
        They&apos;ll ask &ldquo;what is Honeycomb?&rdquo;, &ldquo;how are you different from [their tool]?&rdquo;,
        &ldquo;what&apos;s it cost?&rdquo;. Give a clear, plain-language answer; no jargon needed. When it goes deep
        (implementation, OpenTelemetry rollout, exact pricing), that&apos;s your cue to{" "}
        <strong className="text-white">hand off</strong> to a Technical Support Staffer (an SA, CS, DevRel, or an
        engineer at the booth).
      </Item>
      <Item title="Read the fit, then route.">
        Are they genuinely open to a better way, or just browsing? That read tells you the right next step.
      </Item>
    </ul>
  );
}

export function ScoringContent() {
  return (
    <ul className="space-y-3 text-sm leading-relaxed text-white/75">
      <Item title="Discovery:">
        how well you uncover their real situation: their role, what they use today, what&apos;s not working, and what
        brought them by. The best discovery comes from genuine, open-ended curiosity, not a checklist.
      </Item>
      <Item title="Listening:">
        whether you actually <em>heard</em> them. Did you build on what they said, reflect it back, and follow the
        thread, rather than talking over them or sticking to a script?
      </Item>
      <Item title="Empathy:">
        whether your responses fit the person and made them feel heard. Real commiseration with their frustrations is
        what gets them to open up.
      </Item>
      <Item title="Qualification & Fit:">
        whether you got a read on who they are and whether there&apos;s a genuine fit: are they open to a better way,
        and who&apos;s the right person to route them to? It&apos;s a read, not a push; not everyone should get a demo.
      </Item>
      <Item title="Staying in lane:">
        whether you kept your answers honest and high-level and handed off the deep technical or pricing questions
        instead of winging it or over-promising. Knowing what <em>not</em> to answer is a skill.
      </Item>
      <Item title="Next step:">
        whether you landed the right next step <em>for this person</em>, routing them well rather than forcing everyone
        down the same path.
      </Item>
    </ul>
  );
}

export function OutcomesGrid() {
  const outcomes: Array<[string, string]> = [
    ["Demo", "Hand off to a Technical Support Staffer: anyone genuinely interested"],
    ["Sales follow-up", "Badge scan: someone who manages a team or budget"],
    ["Self-serve", "Free tier and docs: the self-directed IC who'd rather explore alone"],
    ["Polite exit", "Rare: when there's genuinely no fit"],
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      {outcomes.map(([t, d]) => (
        <div key={t} className="rounded-lg border border-white/15 p-3">
          <div className="font-display text-sm font-semibold text-white">{t}</div>
          <div className="text-[13px] text-white/60">{d}</div>
        </div>
      ))}
    </div>
  );
}
