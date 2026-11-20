import { DEFAULT_RETURN_WINDOW_DAYS } from "@/lib/rma/eligibility";
import { formatPoints, pointsToDollars } from "./value";

export type OrderEarn =
  | { kind: "pending"; points: number; releaseAt: string | null }
  | { kind: "earned"; points: number }
  | { kind: "refunded" };

function sgDate(iso: string): string {
  return new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Singapore" }).format(
    new Date(iso),
  );
}

export function orderEarnLine(earn: OrderEarn): string {
  switch (earn.kind) {
    case "pending":
      return earn.releaseAt
        ? `Earns ${formatPoints(earn.points)}, usable from ${sgDate(earn.releaseAt)}`
        : `Earns ${formatPoints(earn.points)}, usable ${DEFAULT_RETURN_WINDOW_DAYS} days after delivery`;
    case "earned":
      return `Earned ${formatPoints(earn.points)}`;
    case "refunded":
      return "Points not earned: refunded";
  }
}

export function pointsUsedRow(spent: number): { label: string; dollars: number } | null {
  if (spent <= 0) return null;
  return { label: `Points used (${Math.round(spent).toLocaleString("en-SG")})`, dollars: pointsToDollars(spent) };
}

export function splitOrderDiscount(
  discountAmount: number,
  pointsSpent: number | null | undefined,
): { discount: number; pointsUsed: { label: string; dollars: number } | null } {
  const pointsUsed = pointsUsedRow(Number(pointsSpent ?? 0));
  const discount = Math.round((Number(discountAmount) - (pointsUsed?.dollars ?? 0)) * 100) / 100;
  return { discount: Math.max(0, discount), pointsUsed };
}
