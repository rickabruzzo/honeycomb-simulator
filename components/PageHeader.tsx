import React from "react";

/**
 * The one page-header pattern shared by every admin page (Builder, Tracker, Editor,
 * Leaderboard, Insights). Left-aligned Poppins title + muted subtitle — no page-level
 * logomark or icon (the single Honeycomb logo lives in the top nav) and no centered
 * variants, so every page reads as the same product.
 */
export function PageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-white">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-white/60">{subtitle}</p>}
    </div>
  );
}
