import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const admin = supabaseAdmin();

  const [totalResult, revenueResult, pendingResult] = await Promise.all([
    // Total orders count
    admin.from("orders").select("*", { count: "exact", head: true }),

    // Revenue: sum of total where status is not cancelled or refunded
    admin
      .from("orders")
      .select("total")
      .not("status", "in", '("cancelled","refunded")'),

    // Pending orders count
    admin
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
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

  const totalOrders = totalResult.count ?? 0;
  const pendingOrders = pendingResult.count ?? 0;

  const revenueOrders = revenueResult.data ?? [];
  const totalRevenue = revenueOrders.reduce(
    (sum: number, row: { total: number }) => sum + (row.total ?? 0),
    0
  );
  const averageOrderValue =
    revenueOrders.length > 0 ? totalRevenue / revenueOrders.length : 0;

  return NextResponse.json({
    ok: true,
    stats: {
      total_orders: totalOrders,
      total_revenue: totalRevenue,
      average_order_value: averageOrderValue,
      pending_orders: pendingOrders,
    },
  });
}
