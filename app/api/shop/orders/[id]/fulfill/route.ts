import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireSettingsAuth } from "@/lib/api-auth";
import { sendShippingEmail } from "@/lib/email";

export const runtime = "nodejs";

const FulfillSchema = z.object({
  tracking_number: z.string().optional(),
  tracking_url: z.string().url().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSettingsAuth();
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = FulfillSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const now = new Date().toISOString();

  const update: Record<string, unknown> = {
    status: "shipped",
    shipped_at: now,
  };

  if (parsed.data.tracking_number) update.tracking_number = parsed.data.tracking_number;
  if (parsed.data.tracking_url) update.tracking_url = parsed.data.tracking_url;

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

  // Add timeline event
  const timelineMessage = parsed.data.tracking_number
    ? `Order shipped. Tracking: ${parsed.data.tracking_number}${parsed.data.tracking_url ? ` — ${parsed.data.tracking_url}` : ""}`
    : "Order marked as shipped.";

  await admin.from("order_timeline").insert({
    order_id: id,
    event_type: "order_shipped",
    message: timelineMessage,
    metadata: {
      tracking_number: parsed.data.tracking_number ?? null,
      tracking_url: parsed.data.tracking_url ?? null,
      shipped_at: now,
    },
  });

  // Shipping/tracking email (idempotent, non-critical — never block fulfillment).
  try {
    await sendShippingEmail(id, data, admin);
  } catch (err) {
    console.error(`[orders/fulfill] Shipping email failed for ${id}:`, err);
  }

  return NextResponse.json({ ok: true, row: data });
}
