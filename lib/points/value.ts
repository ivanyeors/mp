export const POINTS_PER_DOLLAR = 100;

export function pointsToDollars(points: number): number {
  return Math.round(points) / POINTS_PER_DOLLAR;
}

export function formatDollars(amount: number): string {
  const sign = amount < 0 ? "−" : "";
  return `${sign}S$${Math.abs(amount).toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDollarsShort(amount: number): string {
  return Number.isInteger(amount) ? `S$${amount.toLocaleString("en-SG")}` : formatDollars(amount);
}

export function formatEarnRate(perDollar: number): string {
  return `${perDollar.toLocaleString("en-SG")} ${perDollar === 1 ? "point" : "points"}`;
}

export function formatPointsCount(points: number): string {
  const n = Math.round(points);
  return `${n.toLocaleString("en-SG")} ${Math.abs(n) === 1 ? "point" : "points"}`;
}

export function formatPoints(points: number): string {
  return `${formatPointsCount(points)} (${formatDollars(pointsToDollars(points))})`;
}
