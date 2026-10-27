/**
 * Commission calc + lifecycle (#77, ADR 0015). PURE — no I/O, no supabaseAdmin —
 * so the money math is unit-testable in isolation (slice #85). DB reads/writes
 * live in ./ledger, which imports this module.
 *
 * Money rules:
 *  - one flat commission per Qualifying Sale, priced by the partner's terms
 *    (lib/partner-terms, ADR 0034); the per-unit schemes are retired.
 *  - release is dated from delivery (delivered_at + return window), NEVER paid_at.
 */

import { DEFAULT_RETURN_WINDOW_DAYS } from "@/lib/rma/eligibility";

export type CommissionProductType = "pillow" | "bolster";
export type CommissionStatus = "held" | "released" | "void" | "paid";

/** Commission releases exactly when the RMA return window closes — same window. */
export const COMMISSION_RELEASE_WINDOW_DAYS = DEFAULT_RETURN_WINDOW_DAYS;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Round to cents; money never carries float dust. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** release_at = delivered_at + window; null while the order is not yet delivered. */
export function releaseAt(
  deliveredAt: string | null | undefined,
  windowDays: number = COMMISSION_RELEASE_WINDOW_DAYS,
): Date | null {
  if (!deliveredAt) return null;
  return new Date(new Date(deliveredAt).getTime() + windowDays * DAY_MS);
}

/**
 * Derive-on-read status. `void`/`paid`/`released` stick (paid is terminal, like
 * void); a `held` row is effectively released once now >= delivered_at + window.
 * `delivered_at` is the ORDER's delivery date, so release is always dated from
 * delivery — never paid_at.
 */
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

/**
 * Hub money totals (#80) — PURE, so #83 can test the reconciliation math. Groups
 * a partner's commission rows by their PERSISTED status (call `settleDueCommissions`
 * first so matured held rows already read as `released`). Summed in cents so many
 * rows never accrete float dust — reconciles with #81's `releasedBalance` (AC1).
 *   - held     = held (not yet released)
 *   - released = released & unpaid (payout_id null) — the payable balance
 *   - paid     = paid out
 *   - allTime  = everything ever earned except void (held + released + paid)
 */
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
