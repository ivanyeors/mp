import { NextResponse } from "next/server";
import {
  applyOrdersPaidAtRange,
  parseOrdersPaidAtRange,
} from "@/lib/ecommerce/orders-paid-at-range";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const paidAtRange = parseOrdersPaidAtRange(
    searchParams.get("date_from"),
    searchParams.get("date_to")
  );
  if (!paidAtRange.ok) {
    return NextResponse.json({ error: paidAtRange.error }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const [totalResult, revenueResult, pendingResult, marginResult, ledgerResult] =
    await Promise.all([
      applyOrdersPaidAtRange(
        admin.from("orders").select("*", { count: "exact", head: true }),
        paidAtRange.range
      ),
      applyOrdersPaidAtRange(
        admin
          .from("orders")
          .select("total")
          .not("status", "in", '("cancelled","refunded")'),
        paidAtRange.range
      ),
      applyOrdersPaidAtRange(
        admin
          .from("orders")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending"),
        paidAtRange.range
      ),
      applyOrdersPaidAtRange(
        admin
          .from("order_margins")
          .select("order_id, gross_margin, margin_pct, orders!inner(status, paid_at)")
          .not("orders.status", "eq", "cancelled"),
        paidAtRange.range,
        "orders.paid_at"
      ),
      admin.from("order_payments").select("order_id"),
    ]);

  if (totalResult.error) {
    return NextResponse.json({ error: totalResult.error.message }, { status: 500 });
  }
  if (revenueResult.error) {
    return NextResponse.json({ error: revenueResult.error.message }, { status: 500 });
  }
  if (pendingResult.error) {
    return NextResponse.json({ error: pendingResult.error.message }, { status: 500 });
  }
  if (marginResult.error) {
    return NextResponse.json({ error: marginResult.error.message }, { status: 500 });
  }
  if (ledgerResult.error) {
    return NextResponse.json({ error: ledgerResult.error.message }, { status: 500 });
  }

  const totalOrders = totalResult.count ?? 0;
  const pendingOrders = pendingResult.count ?? 0;

  const revenueOrders = revenueResult.data ?? [];
  const totalRevenue = revenueOrders.reduce(
    (sum: number, row: { total: number }) => sum + (row.total ?? 0),
    0
  );
  const averageOrderValue =
    revenueOrders.length > 0 ? totalRevenue / revenueOrders.length : 0;

  const ledgerOrderIds = new Set(
    (ledgerResult.data ?? []).map((row: { order_id: string }) => row.order_id)
  );
  const qualifyingMargins = (marginResult.data ?? []).filter((row) => {
    const ordersJoin = row.orders as
      | { paid_at: string | null }
      | Array<{ paid_at: string | null }>
      | null
      | undefined;
    const paidAt = Array.isArray(ordersJoin) ? ordersJoin[0]?.paid_at : ordersJoin?.paid_at;
    return paidAt != null || ledgerOrderIds.has(row.order_id);
  });
  const totalGrossMargin = qualifyingMargins.reduce(
    (sum: number, row: { gross_margin: number }) => sum + Number(row.gross_margin ?? 0),
    0
  );
  const marginPcts = qualifyingMargins
    .map((row: { margin_pct: number | null }) => row.margin_pct)
    .filter((pct): pct is number => pct != null);
  const avgMarginPct =
    marginPcts.length > 0
      ? marginPcts.reduce((sum, pct) => sum + pct, 0) / marginPcts.length
      : null;

  return NextResponse.json({
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
  });
}
