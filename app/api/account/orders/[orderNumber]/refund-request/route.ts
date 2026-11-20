import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth/user";
import { linkCustomerToAuthUser } from "@/lib/auth/customer-identity";
import { supabaseAdmin } from "@/lib/supabase/server";
import { addOrderTimelineEvent } from "@/lib/ecommerce/orders";
import { customerRefundRequestDeniedReason } from "@/lib/results/post-delivery-refund";

export const runtime = "nodejs";

const BodySchema = z.object({
  note: z.string().max(1000).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const customer = await linkCustomerToAuthUser(user);
  const { orderNumber } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: order, error } = await admin
    .from("orders")
    .select(
      "id, status, shipped_at, delivered_at, refund_request_status, amount_refunded, items:order_items(customization_snapshot)",
    )
    .eq("order_number", decodeURIComponent(orderNumber))
    .eq("customer_id", customer.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const denied = customerRefundRequestDeniedReason(order, order.items ?? []);
  if (denied) {
    return NextResponse.json({ error: denied }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data: updated, error: updErr } = await admin
    .from("orders")
    .update({
      refund_request_status: "requested",
      refund_requested_at: now,
      refund_request_note: parsed.data.note?.trim() || null,
    })
    .eq("id", order.id)
    .select("id, refund_request_status, refund_requested_at, refund_request_note")
    .single();

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  await addOrderTimelineEvent(
    order.id,
    "refund_requested",
    "Customer requested a refund (in-person return required).",
    { note: parsed.data.note?.trim() || null },
  );

  return NextResponse.json({ ok: true, order: updated });
}
