/**
 * Earning points (PRD-loyalty-points slice 03; ADR 0030 rules c, d, e, m;
 * 20261021130000_points_earning.sql).
 *
 * An Order's points are pending until its return window closes; the daily job
 * then writes one `earn` entry (`runPointsEarn`), and right after grants any
 * milestone bonus those points reached (`runPointsMilestones`, slice 09). A
 * refund after that takes back what the refunded cash earned
 * (`clawbackPointsForRefund`). Which Orders
 * earn, and when, is decided in SQL (`points_order_candidates`) so the job,
 * the balance and the Admin Panel agree; `pointsForOrder` is the same formula
 * for code that already holds the Order.
 *
 * Neither writer throws: each runs after something that must not fail because
 * of points (the daily job's other work, a refund already paid out), and
 * reports its error instead.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface EarnBase {
  /** Goods and services: shipping and tax sit outside it. */
  subtotal: number;
  /** Every discount on the Order, points spent included. */
  discount: number;
  /** Cash refunded so far. */
  refunded: number;
}

const cents = (n: number) => (Number.isFinite(n) ? Math.round(n * 100) : 0);

/**
 * Pure — rule (c): `floor(rate × (subtotal − discount − refunded))`, the base
 * floored at 0, so an Order earns on the cash paid for what was kept. Counted
 * in cents and the rate in ten-thousandths, so it rounds down exactly where
 * SQL's numeric does (3 × 33.33 is 99, never 99.99 read as 100).
 */
export function pointsForOrder({ subtotal, discount, refunded }: EarnBase, rate: number): number {
  const base = Math.max(cents(subtotal) - cents(discount) - cents(refunded), 0);
  const perTenThousand = Number.isFinite(rate) && rate > 0 ? Math.round(rate * 10_000) : 0;
  const scaled = perTenThousand * base; // points × 1,000,000, exactly
  return (scaled - (scaled % 1_000_000)) / 1_000_000;
}

const message = (e: unknown, fallback: string) =>
  e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String(e.message) : fallback;

/**
 * The daily job's half of earning: one `earn` entry for each Order whose
 * window has closed, nothing while points are off, nothing twice. Returns how
 * many it wrote.
 */
export async function runPointsEarn(
  admin: SupabaseClient,
  now: Date = new Date(),
): Promise<{ written: number } | { error: string }> {
  try {
    const { data, error } = await admin.rpc("release_earned_points", { p_now: now.toISOString() });
    if (error) return { error: `Could not release earned points: ${error.message}` };
    return { written: Number.isFinite(Number(data)) ? Number(data) : 0 };
  } catch (e) {
    return { error: `Could not release earned points: ${message(e, "unknown error")}` };
  }
}

/**
 * Slice 09, rule (w): the daily job grants each Customer one milestone bonus
 * per milestone reached beyond those they hold, right after the release, so a
 * bonus lands on the same run as the points that reached it. Nothing while
 * points are off or before the launch, nothing twice. Returns how many bonuses
 * it granted.
 */
export async function runPointsMilestones(
  admin: SupabaseClient,
  now: Date = new Date(),
): Promise<{ granted: number } | { error: string }> {
  try {
    const { data, error } = await admin.rpc("grant_due_milestone_bonuses", { p_now: now.toISOString() });
    if (error) return { error: `Could not grant milestone bonuses: ${error.message}` };
    return { granted: Number.isFinite(Number(data)) ? Number(data) : 0 };
  } catch (e) {
    return { error: `Could not grant milestone bonuses: ${message(e, "unknown error")}` };
  }
}

/**
 * Rule (m): a refund after the Order's points were written takes back
 * `floor(rate × amount)`, no more than the Order still holds or the Customer
 * has; a shortfall is noted on the entry, not chased. Once per refund id, so a
 * replayed webhook takes nothing. Call it after the refund is rolled up onto
 * the Order (`rollupOrderMoney`): a refund already in the Order's base when
 * its points were written owes nothing, and the SQL tells the two apart by
 * `amount_refunded`. Returns the points taken, 0 when nothing applies.
 */
export async function clawbackPointsForRefund(
  admin: SupabaseClient,
  p: { orderId: string; refundId: string; amount: number },
): Promise<{ taken: number } | { error: string }> {
  if (!p.refundId?.trim()) return { error: "A points clawback needs the refund id." };
  if (!Number.isFinite(p.amount)) return { error: "A points clawback needs the refund amount." };
  try {
    const { data, error } = await admin.rpc("clawback_points_for_refund", {
      p_order_id: p.orderId,
      p_refund_id: p.refundId,
      p_refund_amount: p.amount,
    });
    if (error) return { error: `Could not take back points for refund ${p.refundId}: ${error.message}` };
    return { taken: Number.isFinite(Number(data)) ? Number(data) : 0 };
  } catch (e) {
    return { error: `Could not take back points for refund ${p.refundId}: ${message(e, "unknown error")}` };
  }
}
