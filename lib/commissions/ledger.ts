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
  total_price?: number | string | null;
};

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

// ponytail: row-by-row (N updates) — fine for a periodic payout job; batch by delivered_at grouping
// if the ledger ever grows large.
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
  paidOn: string;
  method?: string | null;
  reference?: string | null;
  proofPath?: string | null;
  createdBy?: string | null;
}

// ponytail: no row lock — single-operator payout surface. Add SELECT … FOR UPDATE or an advisory
// lock keyed on partnerId if two admins may pay one partner at once.
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
    .eq("status", "released");
  if (updErr) throw new Error(updErr.message);

  return { payoutId: payout.id, commissionsPaid: ids.length };
}
