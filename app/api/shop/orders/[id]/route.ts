import { NextResponse } from "next/server";
import { z } from "zod";
import { loadAdminOrderDetail } from "@/lib/ecommerce/admin/order-detail";
import { supabaseAdmin } from "@/lib/supabase/server";
import { adminCanSeeCost, requireAdmin } from "@/lib/auth/admin";
import { deductStockWhenSold } from "@/lib/ecommerce/order-stock";

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
  const result = await loadAdminOrderDetail(id, { canSeeCost: await adminCanSeeCost() });

  return NextResponse.json(result.body, { status: result.status });
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

  if (parsed.data.status === "cancelled" && !parsed.data.cancelled_at) {
    update.cancelled_at = new Date().toISOString();
  }

  if (parsed.data.status === "delivered" && !parsed.data.delivered_at) {
    update.delivered_at = new Date().toISOString();
  }

  const { data: before } = await admin.from("orders").select("status").eq("id", id).maybeSingle();

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

  const stock = await deductStockWhenSold(admin, id, before?.status, data.status);
  if (stock && !stock.ok) {
    return NextResponse.json({ ok: true, row: { ...data, needs_attention: true }, stock_error: stock.error });
  }

  return NextResponse.json({ ok: true, row: data });
}
