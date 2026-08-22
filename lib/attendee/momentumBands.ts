/**
 * Momentum banding — maps a 0–100 score to a named engagement stage.
 *
 * This is the single source of truth for band thresholds; both the review UI
 * and CTA gating logic import from here rather than hard-coding numbers.
 *
 * Bands:
 *   0 – 15  → GUARDED    (attendee is closed off, not engaging)
 *  16 – 30  → CURIOUS    (some interest, probing questions)
 *  31 – 50  → ENGAGED    (active dialogue, good alignment)
 *  51 – 100 → COMMITTED  (ready to act — demo / badge scan / docs)
 */

export type MomentumBand = "GUARDED" | "CURIOUS" | "ENGAGED" | "COMMITTED";

export const MOMENTUM_BANDS: ReadonlyArray<{
  band: MomentumBand;
  min: number;
  max: number;
}> = [
  { band: "GUARDED", min: 0, max: 15 },
  { band: "CURIOUS", min: 16, max: 30 },
  { band: "ENGAGED", min: 31, max: 50 },
  { band: "COMMITTED", min: 51, max: 100 },
];

export function getMomentumBand(score: number): MomentumBand {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  const match = MOMENTUM_BANDS.find((b) => s >= b.min && s <= b.max);
  return match?.band ?? "GUARDED";
}
