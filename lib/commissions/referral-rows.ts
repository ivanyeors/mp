import type { SupabaseClient } from "@supabase/supabase-js";
import {
  effectiveCommissionStatus,
  releaseAt,
  summarizeCommissionTotals,
  type CommissionStatus,
  type CommissionTotals,
} from "./index";
import { settleDueCommissions } from "./ledger";

export interface RawCommission {
  order_id: string | null;
  partner_id: string;
  product_type: string;
  commission_amount: number | string;
  status: CommissionStatus;
  delivered_at: string | null;
  release_at: string | null;
}

export interface OrderInfo {
  id: string;
  email: string | null;
  name: string | null;
  customer_id: string | null;
  paid_at: string | null;
  delivered_at: string | null;
  attribution_source: string | null;
}

export interface ReferralRow {
  orderId: string;
  partnerId: string;
  partnerName?: string | null;
  customerName: string | null;
  customerEmail: string | null;
  attributionSource: string | null;
  productLabel: string;
  amount: number;
  voidedAmount: number;
  status: CommissionStatus;
  releaseAt: string | null;
  paidAt: string | null;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function buildReferralRows(
  commissions: RawCommission[],
  orders: Map<string, OrderInfo>,
  now: Date,
  partnerNames?: Map<string, string | null>,
): ReferralRow[] {
  const byOrder = new Map<string, RawCommission[]>();
  for (const c of commissions) {
    if (!c.order_id) continue;
    const list = byOrder.get(c.order_id) ?? [];
    list.push(c);
    byOrder.set(c.order_id, list);
  }

  const rows: ReferralRow[] = [];
  for (const [orderId, lines] of byOrder) {
    const order = orders.get(orderId) ?? null;
    const delivered = order?.delivered_at ?? lines[0].delivered_at ?? null;
    const ra = releaseAt(delivered);
    const releaseIso = ra ? ra.toISOString() : lines[0].release_at ?? null;

    let amountC = 0;
    let voidedC = 0;
    for (const l of lines) {
      const c = Math.round(Number(l.commission_amount) * 100);
      if (l.status === "void") voidedC += c;
      else amountC += c;
    }

    const nonVoid = lines.find((l) => l.status !== "void");
    const status: CommissionStatus = nonVoid
      ? effectiveCommissionStatus({ status: nonVoid.status, delivered_at: delivered }, now)
      : "void";

    const productLabel = [...new Set(lines.map((l) => cap(l.product_type)))].join(", ");

    rows.push({
      orderId,
      partnerId: lines[0].partner_id,
      partnerName: partnerNames?.get(lines[0].partner_id) ?? null,
      customerName: order?.name ?? null,
      customerEmail: order?.email ?? null,
      attributionSource: order?.attribution_source ?? null,
      productLabel,
      amount: amountC / 100,
      voidedAmount: voidedC / 100,
      status,
      releaseAt: releaseIso,
      paidAt: order?.paid_at ?? null,
    });
  }

  rows.sort((a, b) => {
    const pa = a.paidAt ? Date.parse(a.paidAt) : -Infinity;
    const pb = b.paidAt ? Date.parse(b.paidAt) : -Infinity;
    if (pa !== pb) return pb - pa;
    return (b.releaseAt ? Date.parse(b.releaseAt) : 0) - (a.releaseAt ? Date.parse(a.releaseAt) : 0);
  });
  return rows;
}

async function loadOrderInfo(
  admin: SupabaseClient,
  orderIds: string[],
): Promise<Map<string, OrderInfo>> {
  if (orderIds.length === 0) return new Map();
  const { data } = await admin
    .from("orders")
    .select("id, email, shipping_address, customer_id, paid_at, delivered_at, attribution_source")
    .in("id", orderIds);
  const map = new Map<string, OrderInfo>();
  for (const o of data ?? []) {
    const addr = (o.shipping_address ?? null) as { recipient?: string } | null;
    map.set(o.id as string, {
      id: o.id as string,
      email: (o.email as string | null) ?? null,
      name: addr?.recipient ?? null,
      customer_id: (o.customer_id as string | null) ?? null,
      paid_at: (o.paid_at as string | null) ?? null,
      delivered_at: (o.delivered_at as string | null) ?? null,
      attribution_source: (o.attribution_source as string | null) ?? null,
    });
  }
  return map;
}

const COMMISSION_ROW_COLUMNS =
  "order_id, partner_id, product_type, commission_amount, status, delivered_at, release_at";

export async function loadPartnerMoneyReferrals(
  admin: SupabaseClient,
  partnerId: string,
): Promise<{
  totals: CommissionTotals;
  headlineCustomers: number;
  pipelineCount: number;
  rows: ReferralRow[];
}> {
  // ponytail: settles ALL partners' due rows (mirrors releasedBalance/#81) — idempotent.
  await settleDueCommissions(admin);

  const [{ data: commissionData }, { data: paidOrders }, { count: pipelineCount }] =
    await Promise.all([
      admin.from("commissions").select(COMMISSION_ROW_COLUMNS).eq("partner_id", partnerId),
      admin
        .from("orders")
        .select("customer_id, email")
        .eq("partner_id", partnerId)
        .not("paid_at", "is", null),
      admin
        .from("mp_config_responses")
        .select("id", { count: "exact", head: true })
        .eq("partner_id", partnerId)
        .is("order_id", null)
        .in("status", ["held", "assigned", "accepted"]),
    ]);

  const commissions = (commissionData ?? []) as RawCommission[];
  const totals = summarizeCommissionTotals(commissions);

  const orderIds = [...new Set(commissions.map((c) => c.order_id).filter(Boolean))] as string[];
  const orders = await loadOrderInfo(admin, orderIds);
  const rows = buildReferralRows(commissions, orders, new Date());

  const distinct = new Set(
    (paidOrders ?? []).map((o) => (o.customer_id as string | null) ?? String(o.email ?? "").toLowerCase()),
  );
  distinct.delete("");

  return { totals, headlineCustomers: distinct.size, pipelineCount: pipelineCount ?? 0, rows };
}

export async function loadAdminReferralRows(admin: SupabaseClient): Promise<ReferralRow[]> {
  await settleDueCommissions(admin);
  const { data: commissionData } = await admin
    .from("commissions")
    .select(COMMISSION_ROW_COLUMNS);
  const commissions = (commissionData ?? []) as RawCommission[];
  if (commissions.length === 0) return [];

  const orderIds = [...new Set(commissions.map((c) => c.order_id).filter(Boolean))] as string[];
  const partnerIds = [...new Set(commissions.map((c) => c.partner_id))];
  const [orders, { data: partnerData }] = await Promise.all([
    loadOrderInfo(admin, orderIds),
    admin.from("partners").select("id, name").in("id", partnerIds),
  ]);
  const partnerNames = new Map<string, string | null>(
    (partnerData ?? []).map((p) => [p.id as string, (p.name as string | null) ?? null]),
  );

  return buildReferralRows(commissions, orders, new Date(), partnerNames);
}
