import { NextResponse } from "next/server";
import { secretMatches } from "@/lib/auth/secret";
import { ORDER_WITH_ITEMS, type CustomerOrder } from "@/lib/shop/customer-orders";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Public, unauthenticated order lookup used by the post-payment confirmation
 * page. Orders are keyed by their (semi-guessable) order number, so a matching
 * Stripe `session_id` is required as a capability token to prevent enumeration
 * of other shoppers' orders.
 *
 * It returns the customer's own columns only (ORDER_WITH_ITEMS): the service
 * role would otherwise hand Staff notes and cost snapshots to anyone holding
 * the success URL, which sits in browser history.
 */
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

  // Capability check: the session id must match the order's Stripe session.
  // Without a valid session id, do not expose order details.
  if (!secretMatches(order.stripe_session_id ?? undefined, sessionId)) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, order });
}
