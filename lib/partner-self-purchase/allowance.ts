/**
 * Partner self-purchase allowance DB layer (#82). Loads a partner's rate/cap
 * (from `partners`) and how many discounted units they've already consumed. The
 * pure calc lives in ./index and is imported here (never the reverse).
 *
 * Consumed = discounted units on the partner's prior PAID, non-cancelled
 * self-purchase orders (paid_at set, status != cancelled — same rule the coupon
 * per-customer counter uses). A pending/abandoned checkout never consumes: its
 * units only count once the webhook marks the order paid.
 */

import { supabaseAdmin } from "@/lib/supabase/server";
import {
  remainingSelfPurchaseUnits,
  type SelfPurchaseKind,
  type SelfPurchaseRate,
} from "./index";

export interface SelfPurchaseAllowance extends SelfPurchaseRate {
  /** cap − unitsUsed, floored at 0. */
  remaining: number;
}

export async function loadSelfPurchaseAllowance(partnerId: string): Promise<SelfPurchaseAllowance> {
  const admin = supabaseAdmin();

  const { data: partner } = await admin
    .from("partners")
    .select("self_purchase_kind, self_purchase_amount, self_purchase_unit_cap")
    .eq("id", partnerId)
    .maybeSingle();

  const kind = (partner?.self_purchase_kind as SelfPurchaseKind | null) ?? null;
  const amount = Number(partner?.self_purchase_amount ?? 0);
  const unitCap = Number(partner?.self_purchase_unit_cap ?? 0);

  const { data: prior } = await admin
    .from("orders")
    .select("self_purchase_units")
    .eq("self_purchase_partner_id", partnerId)
    .neq("status", "cancelled")
    .not("paid_at", "is", null);

  const unitsUsed = (prior ?? []).reduce(
    (sum, o) => sum + Number((o as { self_purchase_units: number | null }).self_purchase_units ?? 0),
    0,
  );

  const rate: SelfPurchaseRate = { kind, amount, unitCap, unitsUsed };
  return { ...rate, remaining: remainingSelfPurchaseUnits(rate) };
}
