import type { SupabaseClient } from "@supabase/supabase-js";

export interface EarnBase {
  subtotal: number;
  discount: number;
  refunded: number;
}

const cents = (n: number) => (Number.isFinite(n) ? Math.round(n * 100) : 0);

export function pointsForOrder({ subtotal, discount, refunded }: EarnBase, rate: number): number {
  const base = Math.max(cents(subtotal) - cents(discount) - cents(refunded), 0);
  const perTenThousand = Number.isFinite(rate) && rate > 0 ? Math.round(rate * 10_000) : 0;
  const scaled = perTenThousand * base;
  return (scaled - (scaled % 1_000_000)) / 1_000_000;
}

const message = (e: unknown, fallback: string) =>
  e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String(e.message) : fallback;

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
