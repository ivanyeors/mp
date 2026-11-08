/**
 * What a point is worth (ADR 0030 (a), (b)). 100 points = S$1, fixed in code:
 * a setting would let one save devalue every balance.
 */

export const POINTS_PER_DOLLAR = 100;

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

/** "1 point", "1.5 points", "3 points": an earn rate, which may be a fraction. */
export function formatEarnRate(perDollar: number): string {
  return `${perDollar.toLocaleString("en-SG")} ${perDollar === 1 ? "point" : "points"}`;
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
