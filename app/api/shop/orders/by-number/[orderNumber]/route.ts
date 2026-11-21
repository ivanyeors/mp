import { NextResponse } from "next/server";
import { secretMatches } from "@/lib/auth/secret";
import { ORDER_WITH_ITEMS, type CustomerOrder } from "@/lib/shop/customer-orders";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  const { orderNumber } = await params;
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("session_id");

  if (!orderNumber) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const admin = supabaseAdmin();

  const { data, error } = await admin
    .from("orders")
    .select(ORDER_WITH_ITEMS)
    .eq("order_number", orderNumber)
    .maybeSingle();

  const order = data as unknown as CustomerOrder | null;
  if (error || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (!secretMatches(order.stripe_session_id ?? undefined, sessionId)) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, order });
}
