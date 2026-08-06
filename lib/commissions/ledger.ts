/**
 * Commission ledger DB layer (#77, ADR 0015). All supabase reads/writes; the pure
 * calc/lifecycle lives in ./index and is imported here (never the reverse).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveScheme,
  computeCommission,
  releaseAt,
  type CommissionScheme,
  type CommissionProductType,
} from "./index";

export interface CommissionLineInput {
  orderItemId: string;
  productType: CommissionProductType;
  /** Per-line BASE (per-unit base × quantity) — excludes add-ons/shipping/tax. */
  baseAmount: number;
  quantity: number;
}

/** A partner's visible schemes: their overrides + the DEFAULT (null-partner) rows. */
async function loadSchemes(
  admin: SupabaseClient,
  partnerId: string,
): Promise<CommissionScheme[]> {
  const { data } = await admin
    .from("commission_schemes")
    .select("partner_id, product_type, kind, amount")
    .or(`partner_id.eq.${partnerId},partner_id.is.null`);
  return (data ?? []).map((s) => ({
    partner_id: s.partner_id ?? null,
    product_type: s.product_type as CommissionProductType,
    kind: s.kind,
    amount: Number(s.amount),
  }));
}

/**
 * Create HELD commission rows for an attributed order's pillow/bolster lines.
 * Idempotent on order_item_id (upsert ignores duplicates on redelivery). Lines
 * with no resolvable scheme are skipped. `deliveredAt` drives release — null until
 * the order is delivered (shop orders), a timestamp at in-store handover.
 */
export async function createHeldCommissionsForOrder(
  admin: SupabaseClient,
  input: {
    orderId: string;
    partnerId: string;
    lines: CommissionLineInput[];
    deliveredAt: string | null;
  },
): Promise<void> {
  if (input.lines.length === 0) return;
  const schemes = await loadSchemes(admin, input.partnerId);
  const ra = releaseAt(input.deliveredAt);

  const rows = [];
  for (const line of input.lines) {
    const scheme = resolveScheme(schemes, input.partnerId, line.productType);
    if (!scheme) continue;
    rows.push({
      order_id: input.orderId,
      order_item_id: line.orderItemId,
      partner_id: input.partnerId,
      product_type: line.productType,
      base_amount: line.baseAmount,
      commission_amount: computeCommission(line.baseAmount, line.quantity, scheme),
      status: "held",
      delivered_at: input.deliveredAt,
      release_at: ra ? ra.toISOString() : null,
    });
  }
  if (rows.length === 0) return;

  const { error } = await admin
    .from("commissions")
    .upsert(rows, { onConflict: "order_item_id", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

/**
 * Void the commissions for exactly the order_items tied to an RMA (a refund
 * resolution reverses the sale). Idempotent — already-void rows are untouched;
 * exchange/replacement never reach here (they settle to `completed`, not `refunded`).
 */
export async function voidCommissionsForRma(
  admin: SupabaseClient,
  rmaId: string,
): Promise<void> {
  const { data: items } = await admin
    .from("rma_request_items")
    .select("order_item_id")
    .eq("rma_request_id", rmaId);
  const ids = (items ?? []).map((i) => i.order_item_id).filter(Boolean);
  if (ids.length === 0) return;

  const { error } = await admin
    .from("commissions")
    .update({ status: "void", voided_at: new Date().toISOString() })
    .in("order_item_id", ids)
    .neq("status", "void");
  if (error) throw new Error(error.message);
}

/**
 * Void EVERY commission on an order (a full refund reverses the whole sale).
 * Complements {@link voidCommissionsForRma}: the RMA path voids per-item on a
 * refund resolution; this covers a full refund issued OUTSIDE an RMA (e.g. a
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
