import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { OrderItem } from "@/lib/types/ecommerce";

export const runtime = "nodejs";

/**
 * Public, unauthenticated order lookup used by the post-payment confirmation
 * page. Orders are keyed by their (semi-guessable) order number, so a matching
 * Stripe `session_id` is required as a capability token to prevent enumeration
 * of other shoppers' orders.
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
    .select("*, order_items(*)")
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Capability check: the session id must match the order's Stripe session.
  // Without a valid session id, do not expose order details.
  if (!sessionId || data.stripe_session_id !== sessionId) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const order = {
    ...data,
    items: (data.order_items ?? []) as OrderItem[],
  };

  return NextResponse.json({ ok: true, order });
}
