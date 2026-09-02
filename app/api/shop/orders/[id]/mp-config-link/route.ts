import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { loadAdminOrderMpConfigLinks } from "@/lib/ecommerce/admin/order-detail";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";

const ParamsSchema = z.object({ id: z.string().uuid() });

// GET — return linked mp_config_responses for this order
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = ParamsSchema.safeParse({ id });
  if (!parsed.success) return NextResponse.json({ error: "Invalid order id" }, { status: 400 });

  const result = await loadAdminOrderMpConfigLinks(parsed.data.id);

  return NextResponse.json(result.body, { status: result.status });
}

const PostBodySchema = z.union([
  z.object({ response_id: z.string().uuid() }),
  z.object({ create: z.literal(true) }),
]);

// POST — link existing response or create new one
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("orders");
  if (denied) return denied;

  const { id: orderId } = await ctx.params;
  const paramsParsed = ParamsSchema.safeParse({ id: orderId });
  if (!paramsParsed.success) return NextResponse.json({ error: "Invalid order id" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const parsed = PostBodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const admin = supabaseAdmin();

  // Verify order exists
  const { data: order } = await admin
    .from("orders")
    .select("id, shipping_address")
    .eq("id", paramsParsed.data.id)
    .single();

  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  if ("response_id" in parsed.data) {
    // Link existing response to this order
    const { error } = await admin
      .from("mp_config_responses")
      .update({ order_id: order.id })
      .eq("id", parsed.data.response_id)
      .is("order_id", null);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, linked: parsed.data.response_id });
  }

  // Create new empty response linked to this order
  const addr = order.shipping_address as { recipient?: string } | null;
  const newId = crypto.randomUUID();

  const { error } = await admin.from("mp_config_responses").insert({
    id: newId,
    data: {
      name: addr?.recipient ?? "",
      gender: "",
      ageGroup: "",
      bloodPressureLevel: "",
      earDiscomfortSideSleep: "",
      bedFirmness: "",
      acidReflux: "",
      shoulderLength: "",
      neckToBack: "",
      headToBack: "",
      neckLength: "",
    },
    is_final: false,
    source: "manual",
    order_id: order.id,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, created: newId });
}

const DeleteBodySchema = z.object({ response_id: z.string().uuid() });

// DELETE — unlink a response from this order (does not delete the response)
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("orders");
  if (denied) return denied;

  const { id: orderId } = await ctx.params;
  const paramsParsed = ParamsSchema.safeParse({ id: orderId });
  if (!paramsParsed.success) return NextResponse.json({ error: "Invalid order id" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const parsed = DeleteBodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const admin = supabaseAdmin();
  const { error } = await admin
    .from("mp_config_responses")
    .update({ order_id: null, order_item_id: null })
    .eq("id", parsed.data.response_id)
    .eq("order_id", paramsParsed.data.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, unlinked: parsed.data.response_id });
}
