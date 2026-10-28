import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";
import { deductOrderStock } from "@/lib/ecommerce/order-stock";
import { isSoldOrderStatus } from "@/lib/ecommerce/sold-status";
import { addOrderTimelineEvent } from "@/lib/ecommerce/orders";

export const runtime = "nodejs";

/**
 * Take a sold Order's goods out of stock when its own deduction did not: a
 * failed write after a Result Accept, a flagged shop Order, or an Order sold
 * before Staff-made Orders deducted. Deducts at most once (`deductOrderStock`).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("orders");
  if (denied) return denied;

  const { id: orderId } = await params;
  const admin = supabaseAdmin();
  const { data: order } = await admin.from("orders").select("id, status").eq("id", orderId).maybeSingle();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (!isSoldOrderStatus(order.status)) {
    return NextResponse.json(
      { error: "Only a confirmed, processing, shipped or delivered Order takes stock." },
      { status: 400 },
    );
  }

  let result;
  try {
    result = await deductOrderStock(admin, orderId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't deduct stock.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (result === "deducted") {
    await addOrderTimelineEvent(orderId, "stock_deducted", "Stock taken out for this order by Staff.");
  }
  return NextResponse.json({ ok: true, result });
}
