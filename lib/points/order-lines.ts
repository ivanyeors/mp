/**
 * Pure — an Order's points in words (PRD-loyalty-points slices 03 and 04), for
 * the order pages and the order emails. `readOrderPoints` (./order.ts) reads
 * what they describe.
 */
import { DEFAULT_RETURN_WINDOW_DAYS } from "@/lib/rma/eligibility";
import { formatPoints, pointsToDollars } from "./value";

export type OrderEarn =
  /** Written when the return window closes; `releaseAt` is null until delivery. */
  | { kind: "pending"; points: number; releaseAt: string | null }
  | { kind: "earned"; points: number }
  /** Refunded down to nothing before its points were written. */
  | { kind: "refunded" };

/** "21 Nov 2026", in Singapore. */
function sgDate(iso: string): string {
  return new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Singapore" }).format(
    new Date(iso),
  );
}

/** Pure — the earning line: "Earns 300 points (S$3.00), usable from 21 Nov 2026". */
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

/** Pure — the spent line's label and amount for a totals table: "Points used (2,000)", −S$20.00 in dollars. */
export function pointsUsedRow(spent: number): { label: string; dollars: number } | null {
  if (spent <= 0) return null;
  return { label: `Points used (${Math.round(spent).toLocaleString("en-SG")})`, dollars: pointsToDollars(spent) };
}
