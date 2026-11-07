/**
 * Turn the Booth FAQ markdown (content/study-guide/sources/booth-faq.md, served by /api/quiz/study)
 * into flashcards. The FAQ is the single source for product facts, so the deck is derived from it
 * rather than kept as a second copy that could drift.
 *
 * The FAQ uses two shapes, both starting with a bold question:
 *   **Question?**            (multi-line: answer paragraphs/bullets follow, then "Source(s): …")
 *   **Question?** Answer. Source: …   (single line)
 * "## Heading" lines start a section. Sections with no bold question lines (positioning notes,
 * escalation scripts) produce no cards.
 */

export interface FaqCard {
  id: string;
  section: string;
  question: string;
  /** Answer lines; a line starting with "- " is a bullet. */
  answer: string[];
  source?: string;
}

const SOURCE_RE = /\bSources?:\s*/;

function titleCase(heading: string): string {
  const h = heading.trim();
  // Headings in the FAQ are shouted ("GENERAL PRODUCT QUESTIONS"); render them calmly.
  if (h !== h.toUpperCase()) return h;
  return h
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\bOpentelemetry\b/g, "OpenTelemetry")
    .replace(/\bFaq\b/g, "FAQ");
}

function splitSource(text: string): { body: string; source?: string } {
  const m = SOURCE_RE.exec(text);
  if (!m) return { body: text.trim() };
  return { body: text.slice(0, m.index).trim(), source: text.slice(m.index + m[0].length).trim() || undefined };
}

export function faqToCards(markdown: string | null | undefined): FaqCard[] {
  if (!markdown) return [];
  const cards: FaqCard[] = [];
  let section = "Booth FAQ";
  let current: FaqCard | null = null;

  const finish = () => {
    if (!current) return;
    current.answer = current.answer.filter((l) => l.length > 0);
    if (current.answer.length) cards.push(current);
    current = null;
  };

  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("# ")) continue;
    if (line.startsWith("Source of truth:")) continue;
    if (line.startsWith("## ")) {
      finish();
      section = titleCase(line.slice(3));
      continue;
    }
    const bold = /^\*\*([^*]+)\*\*\s*(.*)$/.exec(line);
    if (bold) {
      finish();
      const question = bold[1].trim();
      current = { id: "", section, question, answer: [] };
      const rest = bold[2].trim();
      if (rest) {
        const { body, source } = splitSource(rest);
        if (body) current.answer.push(body);
        if (source) current.source = source;
      }
      continue;
    }
    if (!current) continue; // prose outside a question (section intros, escalation scripts)
    if (SOURCE_RE.test(line) && SOURCE_RE.exec(line)!.index === 0) {
      current.source = line.replace(SOURCE_RE, "").trim() || undefined;
      continue;
    }
    const { body, source } = splitSource(line);
    if (body) current.answer.push(/^[-*] /.test(line) ? "- " + body.replace(/^[-*] /, "") : body);
    if (source) current.source = source;
  }
  finish();

  // Stable ids from section + question so per-viewer progress survives FAQ edits elsewhere.
  const seen = new Map<string, number>();
  for (const c of cards) {
    const base = `${c.section}|${c.question}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    c.id = n ? `${base}-${n + 1}` : base;
  }
  return cards;
}

export function faqSections(cards: FaqCard[]): string[] {
  const out: string[] = [];
  for (const c of cards) if (!out.includes(c.section)) out.push(c.section);
  return out;
}
