import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";
import { restockOrderItem } from "@/lib/ecommerce/restock-order";
import { addOrderTimelineEvent } from "@/lib/ecommerce/orders";

export const runtime = "nodejs";

const RestockSchema = z.object({
  items: z
    .array(
      z.object({
        order_item_id: z.string().uuid(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1),
  stripe_refund_id: z.string().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("orders");
  if (denied) return denied;

  const { id: orderId } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = RestockSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: order } = await admin.from("orders").select("id").eq("id", orderId).single();
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const results: Array<{ order_item_id: string; returned_quantity: number }> = [];

  try {
    for (const line of parsed.data.items) {
      const { returnedQuantity } = await restockOrderItem(
        admin,
        orderId,
        line.order_item_id,
        line.quantity,
        { stripeRefundId: parsed.data.stripe_refund_id }
      );
      results.push({ order_item_id: line.order_item_id, returned_quantity: returnedQuantity });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Restock failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const totalUnits = parsed.data.items.reduce((s, i) => s + i.quantity, 0);
  await addOrderTimelineEvent(
    orderId,
    "restocked",
    `Staff restocked ${totalUnits} returned unit(s)`,
    { items: parsed.data.items, stripe_refund_id: parsed.data.stripe_refund_id ?? null }
  );

  return NextResponse.json({ ok: true, items: results });
}
