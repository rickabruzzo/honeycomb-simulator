import React from "react";
import { BookOpen, ExternalLink } from "lucide-react";

/**
 * The trainee-facing link to the study guide. One component so it reads as a link everywhere it
 * appears (the quiz-first card, the quiz intro, the grade screen, the ready popup): Pacific blue,
 * underlined, book icon, opens in a new tab. ?trainee=1 hides the admin tabs on the study page.
 */
export function StudyGuideLink({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <a
      href="/study?trainee=1"
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-1.5 text-sm font-medium text-[#7cc6f2] underline decoration-[#7cc6f2]/50 underline-offset-4 transition hover:text-white hover:decoration-white ${className}`}
    >
      <BookOpen size={15} aria-hidden />
      <span>{children}</span>
      <ExternalLink size={13} aria-hidden className="opacity-70" />
    </a>
  );
}
