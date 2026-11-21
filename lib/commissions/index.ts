import { DEFAULT_RETURN_WINDOW_DAYS } from "@/lib/rma/eligibility";

export type CommissionProductType = "pillow" | "bolster";
export type CommissionStatus = "held" | "released" | "void" | "paid";

export const COMMISSION_RELEASE_WINDOW_DAYS = DEFAULT_RETURN_WINDOW_DAYS;
const DAY_MS = 24 * 60 * 60 * 1000;

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function releaseAt(
  deliveredAt: string | null | undefined,
  windowDays: number = COMMISSION_RELEASE_WINDOW_DAYS,
): Date | null {
  if (!deliveredAt) return null;
  return new Date(new Date(deliveredAt).getTime() + windowDays * DAY_MS);
}

export function effectiveCommissionStatus(
  row: { status: CommissionStatus; delivered_at: string | null },
  now: Date,
  windowDays: number = COMMISSION_RELEASE_WINDOW_DAYS,
): CommissionStatus {
  if (row.status === "void") return "void";
  if (row.status === "paid") return "paid";
  if (row.status === "released") return "released";
  const ra = releaseAt(row.delivered_at, windowDays);
  if (ra && now.getTime() >= ra.getTime()) return "released";
  return "held";
}

export interface CommissionTotalsRow {
  status: CommissionStatus;
  commission_amount: number | string;
  payout_id?: string | null;
}
export interface CommissionTotals {
  held: number;
  released: number;
  paid: number;
  allTime: number;
}
export function summarizeCommissionTotals(rows: CommissionTotalsRow[]): CommissionTotals {
  let heldC = 0;
  let releasedC = 0;
  let paidC = 0;
  let allC = 0;
  for (const r of rows) {
    if (r.status === "void") continue;
    const cents = Math.round(Number(r.commission_amount) * 100);
    allC += cents;
    if (r.status === "held") heldC += cents;
    else if (r.status === "paid") paidC += cents;
    else if (r.status === "released" && r.payout_id == null) releasedC += cents;
  }
  return { held: heldC / 100, released: releasedC / 100, paid: paidC / 100, allTime: allC / 100 };
}
