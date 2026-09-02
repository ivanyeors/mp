import { NextResponse } from "next/server";
import { z } from "zod";
import { loadAdminOrderTimeline } from "@/lib/ecommerce/admin/order-detail";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";

const AddTimelineEventSchema = z.object({
  event_type: z.string().min(1),
  message: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("orders");
  if (denied) return denied;

  const { id } = await params;
  const result = await loadAdminOrderTimeline(id);

  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("orders");
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = AddTimelineEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();

  // Verify the order exists
  const { error: orderError } = await admin
    .from("orders")
    .select("id")
    .eq("id", id)
    .single();

  if (orderError) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const { data, error } = await admin
    .from("order_timeline")
    .insert({
      order_id: id,
      event_type: parsed.data.event_type,
      message: parsed.data.message,
      metadata: parsed.data.metadata ?? null,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, row: data }, { status: 201 });
}
