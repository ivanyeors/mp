import {
  applyOrdersPaidAtRange,
  parseOrdersPaidAtRange,
} from "@/lib/ecommerce/orders-paid-at-range";
import { supabaseAdmin } from "@/lib/supabase/server";

/** One row of aggregate output; numeric aggregates may arrive as strings. */
type AggregateRow = Record<string, number | string | null>;

function aggNumber(row: AggregateRow | undefined, key: string): number {
  const raw = row?.[key];
  if (raw == null) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export interface OrdersDashboardParams {
  date_from?: string | null;
  date_to?: string | null;
}

export interface OrdersDashboardStats {
  total_orders: number;
  revenue: number;
  avg_order_value: number;
  total_revenue: number;
  average_order_value: number;
  pending_orders: number;
  total_gross_margin: number;
  avg_margin_pct: number | null;
}

export type OrdersDashboardResult =
  | { status: 200; body: { ok: true; stats: OrdersDashboardStats } }
  | { status: 400 | 500; body: { error: string } };

/**
 * Assembles the `/api/shop/orders/dashboard` GET payload so the route handler
 * and the RSC orders page share one implementation.
 */
export async function loadOrdersDashboard(
  params: OrdersDashboardParams = {},
): Promise<OrdersDashboardResult> {
  const paidAtRange = parseOrdersPaidAtRange(
    params.date_from ?? null,
    params.date_to ?? null,
  );
  if (!paidAtRange.ok) {
    return { status: 400, body: { error: paidAtRange.error } };
  }

  const admin = supabaseAdmin();

  const [totalResult, revenueResult, pendingResult, marginResult] = await Promise.all([
    applyOrdersPaidAtRange(
      admin.from("orders").select("*", { count: "exact", head: true }),
      paidAtRange.range,
    ),
    // Revenue + order count computed in Postgres. PostgREST aggregate functions
    // are disabled on this project, so this goes through a SQL function that
    // applies the same open-ended paid_at range and status exclusions.
    admin.rpc("admin_orders_revenue_summary", {
      p_from: paidAtRange.range.from ?? null,
      p_to: paidAtRange.range.toExclusive ?? null,
    }),
    applyOrdersPaidAtRange(
      admin.from("orders").select("*", { count: "exact", head: true }).eq("status", "pending"),
      paidAtRange.range,
    ),
    // Margins cannot be aggregated in PostgREST: a row qualifies when the order
    // has a paid_at OR has a payment-ledger entry, which needs the ledger set.
    // Minimal columns only; `orders.status` is filtered without being selected.
    applyOrdersPaidAtRange(
      admin
        .from("order_margins")
        .select("order_id, gross_margin, margin_pct, orders!inner(paid_at)")
        .not("orders.status", "eq", "cancelled"),
      paidAtRange.range,
      "orders.paid_at",
    ),
  ]);

  if (totalResult.error) {
    return { status: 500, body: { error: totalResult.error.message } };
  }
  if (revenueResult.error) {
    return { status: 500, body: { error: revenueResult.error.message } };
  }
  if (pendingResult.error) {
    return { status: 500, body: { error: pendingResult.error.message } };
  }
  if (marginResult.error) {
    return { status: 500, body: { error: marginResult.error.message } };
  }

  const totalOrders = totalResult.count ?? 0;
  const pendingOrders = pendingResult.count ?? 0;

  const revenueData = revenueResult.data as AggregateRow[] | AggregateRow | null;
  const revenueAgg = (Array.isArray(revenueData) ? revenueData[0] : revenueData) ?? undefined;
  const totalRevenue = aggNumber(revenueAgg, "revenue_sum");
  const revenueCount = aggNumber(revenueAgg, "revenue_count");
  const averageOrderValue = revenueCount > 0 ? totalRevenue / revenueCount : 0;

  const marginRows = marginResult.data ?? [];
  const paidAtOf = (row: { orders?: unknown }): string | null => {
    const ordersJoin = row.orders as
      | { paid_at: string | null }
      | Array<{ paid_at: string | null }>
      | null
      | undefined;
    const paidAt = Array.isArray(ordersJoin) ? ordersJoin[0]?.paid_at : ordersJoin?.paid_at;
    return paidAt ?? null;
  };

  // Only unpaid-at margin rows need the payment ledger, so scope the lookup to
  // those order ids instead of scanning the whole order_payments table.
  const unpaidOrderIds = Array.from(
    new Set(
      marginRows
        .filter((row) => paidAtOf(row) == null)
        .map((row: { order_id: string }) => row.order_id),
    ),
  );

  let ledgerOrderIds = new Set<string>();
  if (unpaidOrderIds.length > 0) {
    const ledgerResult = await admin
      .from("order_payments")
      .select("order_id")
      .in("order_id", unpaidOrderIds);
    if (ledgerResult.error) {
      return { status: 500, body: { error: ledgerResult.error.message } };
    }
    ledgerOrderIds = new Set(
      (ledgerResult.data ?? []).map((row: { order_id: string }) => row.order_id),
    );
  }

  const qualifyingMargins = marginRows.filter(
    (row) => paidAtOf(row) != null || ledgerOrderIds.has(row.order_id),
  );
  const totalGrossMargin = qualifyingMargins.reduce(
    (sum: number, row: { gross_margin: number }) => sum + Number(row.gross_margin ?? 0),
    0,
  );
  const marginPcts = qualifyingMargins
    .map((row: { margin_pct: number | null }) => row.margin_pct)
    .filter((pct): pct is number => pct != null);
  const avgMarginPct =
    marginPcts.length > 0
      ? marginPcts.reduce((sum, pct) => sum + pct, 0) / marginPcts.length
      : null;

  return {
    status: 200,
    body: {
      ok: true,
      stats: {
        total_orders: totalOrders,
        revenue: totalRevenue,
        avg_order_value: averageOrderValue,
        total_revenue: totalRevenue,
        average_order_value: averageOrderValue,
        pending_orders: pendingOrders,
        total_gross_margin: totalGrossMargin,
        avg_margin_pct: avgMarginPct,
      },
    },
  };
}
