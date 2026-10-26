/**
 * Partner self-purchase allowance DB layer (#82). Loads a partner's rate/cap
 * (from `partners`) and how many discounted units they've already consumed. The
 * pure calc lives in ./index and is imported here (never the reverse).
 *
 * Consumed = discounted units on the partner's PAID, non-cancelled
 * self-purchase orders, plus those on orders whose Checkout is still open
 * (pending, unpaid, younger than a Checkout Session: one hour). Counting only paid ones
 * let a partner open several checkouts before paying any, each priced against
 * the full remaining cap. An abandoned checkout stops counting once it expires.
 */


import { supabaseAdmin } from "@/lib/supabase/server";
import { OPEN_CHECKOUT_WINDOW_MS } from "@/lib/stripe/checkout-lifetime";
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

  const [{ data: paid }, { data: open }] = await Promise.all([
    admin
      .from("orders")
      .select("self_purchase_units")
      .eq("self_purchase_partner_id", partnerId)
      .neq("status", "cancelled")
      .not("paid_at", "is", null),
    admin
      .from("orders")
      .select("self_purchase_units")
      .eq("self_purchase_partner_id", partnerId)
      .eq("status", "pending")
      .is("paid_at", null)
      .gte("created_at", new Date(Date.now() - OPEN_CHECKOUT_WINDOW_MS).toISOString()),
  ]);
  const prior = [...(paid ?? []), ...(open ?? [])];

  const unitsUsed = prior.reduce(
    (sum, o) => sum + Number((o as { self_purchase_units: number | null }).self_purchase_units ?? 0),
    0,
  );

  const rate: SelfPurchaseRate = { kind, amount, unitCap, unitsUsed };
  return { ...rate, remaining: remainingSelfPurchaseUnits(rate) };
}
