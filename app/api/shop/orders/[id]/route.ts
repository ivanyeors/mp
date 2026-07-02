import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";

const UpdateOrderSchema = z.object({
  status: z
    .enum([
      "pending",
      "confirmed",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
      "refunded",
      "partially_refunded",
    ])
    .optional(),
  tracking_number: z.string().optional(),
  tracking_url: z.string().url().optional(),
  shipped_at: z.string().datetime().optional(),
  delivered_at: z.string().datetime().optional(),
  cancelled_at: z.string().datetime().optional(),
  internal_notes: z.string().optional(),
  notes: z.string().optional(),
}).partial();

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("orders");
  if (denied) return denied;

  const { id } = await params;
  const admin = supabaseAdmin();

  const [{ data, error }, { data: margin }] = await Promise.all([
    admin
      .from("orders")
      .select("*, order_items(*), order_timeline(*)")
      .eq("id", id)
      .single(),
    admin.from("order_margins").select("*").eq("order_id", id).maybeSingle(),
  ]);

  if (error) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const orderItems = Array.isArray(data.order_items) ? data.order_items : [];
  const timeline = Array.isArray(data.order_timeline)
    ? [...data.order_timeline].sort(
        (a: { created_at: string }, b: { created_at: string }) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    : [];
  const { order_items: _items, order_timeline: _timeline, ...orderFields } = data;

  return NextResponse.json({
    ok: true,
    row: { ...orderFields, items: orderItems, timeline },
    margin: margin ?? null,
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("orders");
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = UpdateOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const update: Record<string, unknown> = { ...parsed.data };

  // Auto-set cancelled_at when cancelling if not provided
  if (parsed.data.status === "cancelled" && !parsed.data.cancelled_at) {
    update.cancelled_at = new Date().toISOString();
  }

  // Auto-set delivered_at when marking delivered if not provided
  if (parsed.data.status === "delivered" && !parsed.data.delivered_at) {
    update.delivered_at = new Date().toISOString();
  }

  const { data, error } = await admin
    .from("orders")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    if (/not found|no rows/i.test(error.message)) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, row: data });
}
