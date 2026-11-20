import type { SupabaseClient } from "@supabase/supabase-js";
import { isPartnerCustomer, readPointsSettings } from "./server";
import type { OrderEarn } from "./order-lines";

export { orderEarnLine, pointsUsedRow, splitOrderDiscount, type OrderEarn } from "./order-lines";

export interface OrderPoints {
  spent: number;
  earn: OrderEarn | null;
}

export interface OrderPointsRow {
  id: string;
  customer_id: string | null;
  paid_at: string | null;
  subtotal: number;
  discount_amount: number;
  amount_refunded?: number | null;
  points_spent?: number | null;
}

const int = (v: unknown) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);

export async function readOrderPoints(admin: SupabaseClient, order: OrderPointsRow): Promise<OrderPoints> {
  const spent = int(order.points_spent ?? 0);
  if (!order.customer_id || !order.paid_at) return { spent, earn: null };
  const settings = await readPointsSettings(admin);
  if (!settings.enabled || !settings.launchAt || Date.parse(order.paid_at) < Date.parse(settings.launchAt)) return { spent, earn: null };

  const [earned, candidate] = await Promise.all([
    admin.from("points_ledger").select("points").eq("order_id", order.id).eq("kind", "earn").maybeSingle(),
    admin.from("points_order_candidates").select("points, release_at").eq("order_id", order.id).maybeSingle(),
  ]);
  if (earned.error) throw new Error(`Could not read the order's points: ${earned.error.message}`);
  if (candidate.error) throw new Error(`Could not read the order's points: ${candidate.error.message}`);
  if (earned.data) return { spent, earn: { kind: "earned", points: int((earned.data as { points: number }).points) } };
  if (candidate.data) {
    const c = candidate.data as { points: number; release_at: string | null };
    return { spent, earn: { kind: "pending", points: int(c.points), releaseAt: c.release_at } };
  }
  const base = Number(order.subtotal) - Number(order.discount_amount) - Number(order.amount_refunded ?? 0);
  if (Number(order.amount_refunded ?? 0) > 0 && base <= 0 && !(await isPartnerCustomer(admin, order.customer_id))) {
    return { spent, earn: { kind: "refunded" } };
  }
  return { spent, earn: null };
}
