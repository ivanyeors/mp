/**
 * What a point is worth (ADR 0030 (a), (b)). 10 points = S$1 (amended
 * 2026-11-08; it was 100), fixed in code and in SQL
 * (`orders_points_discount_matches`, `reserve_points`): a setting would let
 * one save devalue every balance.
 */

export const POINTS_PER_DOLLAR = 10;

/** Pure — the share of what they pay a customer gets back at an earn rate, in percent: 1 point per S$1 is 10. */
export function percentBack(earnPerDollar: number): number {
  return Math.round(((earnPerDollar * 100) / POINTS_PER_DOLLAR) * 100) / 100;
}

/** S$ for a number of points, to the cent. */
export function pointsToDollars(points: number): number {
  return Math.round(points) / POINTS_PER_DOLLAR;
}

/** "S$21.30". */
export function formatDollars(amount: number): string {
  const sign = amount < 0 ? "−" : "";
  return `${sign}S$${Math.abs(amount).toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "S$10" for whole dollars, "S$10.50" otherwise: for sentences, not tables. */
export function formatDollarsShort(amount: number): string {
  return Number.isInteger(amount) ? `S$${amount.toLocaleString("en-SG")}` : formatDollars(amount);
}

/** "2,130 points", "1 point". */
export function formatPointsCount(points: number): string {
  const n = Math.round(points);
  return `${n.toLocaleString("en-SG")} ${Math.abs(n) === 1 ? "point" : "points"}`;
}

/** "2,130 points (S$21.30)": a balance is always shown in both (rule b). */
export function formatPoints(points: number): string {
  return `${formatPointsCount(points)} (${formatDollars(pointsToDollars(points))})`;
}
