/**
 * Commission ledger DB layer (#77, ADR 0015). All supabase reads/writes; the pure
 * calc/lifecycle lives in ./index and is imported here (never the reverse).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PARTNER_TERMS_COLUMNS,
  commissionInEffect,
  isEligibleOrderItem,
  partnerTermsOf,
  sgtDate,
  type CommissionOrderItem,
  type PartnerTermsRow,
} from "@/lib/partner-terms";
import { round2, releaseAt } from "./index";

export type CommissionItemInput = CommissionOrderItem & {
  id: string;
  /** The line's goods, recorded as the commission's base for reference. */
  total_price?: number | string | null;
};

/**
 * Create the HELD commission for an attributed order, once per Qualifying Sale
 * (ADR 0034): an order with at least one customised premium pillow earns the
 * partner's flat commission, however many it holds. Nothing else earns.
 *
 * `amount` is the commission the hold fixed (clause 7.2: the pick in force the day
 * the customer paid); without one, the partner's terms today price it. The row
 * sits on the order's first eligible line, so redelivery picks the same line and
 * the upsert is a no-op. `deliveredAt` drives release — null until delivered, a
 * timestamp at in-store handover. Returns whether the order qualifies.
 */
export async function createHeldCommissionsForOrder(
  admin: SupabaseClient,
  input: {
    orderId: string;
    partnerId: string;
    items: CommissionItemInput[];
    deliveredAt: string | null;
    amount?: number | null;
  },
): Promise<boolean> {
  const eligible = input.items.filter(isEligibleOrderItem).sort((a, b) => a.id.localeCompare(b.id));
  if (eligible.length === 0) return false;

  let amount = input.amount ?? null;
  if (amount == null) {
    const { data: partner, error } = await admin
      .from("partners")
      .select(PARTNER_TERMS_COLUMNS)
      .eq("id", input.partnerId)
      .maybeSingle();
    if (error || !partner) throw new Error(error?.message ?? "Partner not found");
    amount = commissionInEffect(partnerTermsOf(partner as PartnerTermsRow), sgtDate(new Date()));
  }

  const ra = releaseAt(input.deliveredAt);
  const { error } = await admin.from("commissions").upsert(
    {
      order_id: input.orderId,
      order_item_id: eligible[0].id,
      partner_id: input.partnerId,
      product_type: "pillow",
      basis: "order",
      base_amount: round2(eligible.reduce((sum, it) => sum + Math.max(0, Number(it.total_price ?? 0)), 0)),
      commission_amount: round2(Math.max(0, amount)),
      status: "held",
      delivered_at: input.deliveredAt,
      release_at: ra ? ra.toISOString() : null,
    },
    { onConflict: "order_item_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
  return true;
}

/**
 * Void what an RMA refund reverses. A row on a refunded line goes (the retired
 * per-unit rows). And a refunded customised premium pillow means the order is no
 * Qualifying Sale (Schedule: no Eligible Product refunded), so the order's flat
 * commission goes too, whichever line it sits on. Idempotent — already-void rows
 * are untouched; exchange/replacement never reach here (they settle to
 * `completed`, not `refunded`).
 */
export async function voidCommissionsForRma(
  admin: SupabaseClient,
  rmaId: string,
): Promise<void> {
  const { data: items } = await admin
    .from("rma_request_items")
    .select("order_item_id")
    .eq("rma_request_id", rmaId);
  await voidCommissionsForItems(
    admin,
    (items ?? []).map((i) => i.order_item_id).filter(Boolean),
  );
}

/**
 * Void what refunding these returned lines reverses, by the rule above. Shared
 * by the RMA refund and a Staff refund for a return; idempotent.
 */
export async function voidCommissionsForItems(
  admin: SupabaseClient,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;

  const voided = { status: "void", voided_at: new Date().toISOString() };
  const { error } = await admin
    .from("commissions")
    .update(voided)
    .in("order_item_id", ids)
    .neq("status", "void");
  if (error) throw new Error(error.message);

  const { data: lines, error: linesErr } = await admin
    .from("order_items")
    .select("order_id, kind, customization_snapshot")
    .in("id", ids);
  if (linesErr) throw new Error(linesErr.message);
  const orderIds = [
    ...new Set(
      (lines ?? [])
        .filter((l) => isEligibleOrderItem(l as CommissionOrderItem))
        .map((l) => l.order_id as string),
    ),
  ];
  if (orderIds.length === 0) return;
  const { error: orderErr } = await admin
    .from("commissions")
    .update(voided)
    .in("order_id", orderIds)
    .eq("basis", "order")
    .neq("status", "void");
  if (orderErr) throw new Error(orderErr.message);
}

/**
 * Void EVERY commission on an order (a full refund reverses the whole sale).
 * Complements {@link voidCommissionsForRma}: the RMA path voids on a refund
 * resolution; this covers a full refund issued OUTSIDE an RMA (e.g. a
 * staff Stripe-dashboard refund), which otherwise leaves commission held/released
 * on a fully-refunded order. Idempotent — already-void rows are untouched.
 */
export async function voidCommissionsForOrder(
  admin: SupabaseClient,
  orderId: string,
): Promise<void> {
  const { error } = await admin
    .from("commissions")
    .update({ status: "void", voided_at: new Date().toISOString() })
    .eq("order_id", orderId)
    .neq("status", "void");
  if (error) throw new Error(error.message);
}

/**
 * Idempotent settle: flips held → released for every commission whose window has
 * closed, dated from the ORDER's live delivered_at (never paid_at). Not scheduled
 * here — the payout slice (#81) calls it. Returns the count released.
 *
 * ponytail: row-by-row (N updates) — fine for a periodic payout job; batch by
 * delivered_at grouping if the ledger ever grows large.
 */
export async function settleDueCommissions(
  admin: SupabaseClient,
  now: Date = new Date(),
): Promise<number> {
  const { data } = await admin
    .from("commissions")
    .select("id, delivered_at, orders(delivered_at)")
    .eq("status", "held");

  let released = 0;
  for (const row of (data ?? []) as unknown as Array<{
    id: string;
    delivered_at: string | null;
    // Supabase types an embedded to-one as an array; runtime is an object. Read both.
    orders: { delivered_at: string | null } | { delivered_at: string | null }[] | null;
  }>) {
    const ordersRel = Array.isArray(row.orders) ? row.orders[0] : row.orders;
    const delivered = ordersRel?.delivered_at ?? row.delivered_at ?? null;
    const ra = releaseAt(delivered);
    if (!ra || now.getTime() < ra.getTime()) continue;
    const { error } = await admin
      .from("commissions")
      .update({
        status: "released",
        delivered_at: delivered,
        release_at: ra.toISOString(),
        released_at: now.toISOString(),
      })
      .eq("id", row.id)
      .eq("status", "held");
    if (!error) released++;
  }
  return released;
}

/**
 * A partner's releasable balance (#81): sum of `released`, not-yet-paid
 * commission_amount. Settles due (held→released) FIRST so newly-matured
 * commissions count — keeps the hub + admin surfaces consistent. `void`/`paid`
 * are excluded (settled rows carry status `released`; paying flips them to `paid`).
 * Summed in cents so many rows never accrete float dust. No minimum (AC5): a
 * 1-cent balance is returned as-is.
 */
export async function releasedBalance(
  admin: SupabaseClient,
  partnerId: string,
): Promise<number> {
  await settleDueCommissions(admin);
  const { data } = await admin
    .from("commissions")
    .select("commission_amount")
    .eq("partner_id", partnerId)
    .eq("status", "released")
    .is("payout_id", null);
  const cents = (data ?? []).reduce(
    (sum, r) => sum + Math.round(Number(r.commission_amount) * 100),
    0,
  );
  return cents / 100;
}

export interface RecordPayoutInput {
  partnerId: string;
  amount: number;
  /** yyyy-mm-dd */
  paidOn: string;
  method?: string | null;
  reference?: string | null;
  /** Private-bucket key of the proof-of-payment image. */
  proofPath?: string | null;
  createdBy?: string | null;
}

/**
 * Record an IMMUTABLE payout row and mark the covered released commissions `paid`
 * (#81, AC3/AC6). Settles due first. For a positive amount, released+unpaid
 * commissions are claimed oldest-first until their cumulative total reaches
 * `amount` (whole commissions — a single commission is never split); those flip to
 * `paid` and link to the payout. A zero/negative amount (a correction, AC6)
 * records the row only and touches no commissions. Returns the new payout id and
 * how many commissions it marked paid.
 *
 * ponytail: no row lock — single-operator payout surface. Add SELECT … FOR UPDATE
 * or an advisory lock keyed on partnerId if two admins may pay one partner at once.
 */
export async function recordPayout(
  admin: SupabaseClient,
  input: RecordPayoutInput,
): Promise<{ payoutId: string; commissionsPaid: number }> {
  await settleDueCommissions(admin);

  const { data: payout, error: insErr } = await admin
    .from("partner_payouts")
    .insert({
      partner_id: input.partnerId,
      amount: input.amount,
      paid_on: input.paidOn,
      method: input.method ?? null,
      reference: input.reference ?? null,
      proof_path: input.proofPath ?? null,
      created_by: input.createdBy ?? null,
    })
    .select("id")
    .single();
  if (insErr || !payout) throw new Error(insErr?.message ?? "Failed to record payout");

  if (input.amount <= 0) return { payoutId: payout.id, commissionsPaid: 0 };

  const { data: rows } = await admin
    .from("commissions")
    .select("id, commission_amount")
    .eq("partner_id", input.partnerId)
    .eq("status", "released")
    .is("payout_id", null)
    .order("created_at", { ascending: true });

  const targetCents = Math.round(input.amount * 100);
  let accCents = 0;
  const ids: string[] = [];
  for (const r of rows ?? []) {
    if (accCents >= targetCents) break;
    accCents += Math.round(Number(r.commission_amount) * 100);
    ids.push(r.id as string);
  }
  if (ids.length === 0) return { payoutId: payout.id, commissionsPaid: 0 };

  const { error: updErr } = await admin
    .from("commissions")
    .update({ status: "paid", payout_id: payout.id })
    .in("id", ids)
    .eq("status", "released"); // guard: only flip still-released rows
  if (updErr) throw new Error(updErr.message);

  return { payoutId: payout.id, commissionsPaid: ids.length };
}
