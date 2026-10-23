import { NextResponse } from "next/server";
import { invalidateTag } from "@/lib/cache/invalidate";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  COLLECT_FLAT_ERROR,
  collectIsFlat,
  COURIER_PIN_ERROR,
  courierPinned,
  LIVE_PRICE_ERROR,
  LiveRateFields,
  livePriced,
  SelfCollectFields,
} from "@/lib/shipping/method-schema";
import { requireAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";

const UpdateShippingMethodSchema = z.object({
  slug: z.string().trim().min(1).max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  content: z.record(z.string(), z.unknown()).optional(),
  base_rate: z.number().nonnegative().optional(),
  free_above: z.number().nonnegative().nullable().optional(),
  currency: z.string().optional(),
  countries: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
  position: z.number().int().nonnegative().optional(),
  ...LiveRateFields,
  ...SelfCollectFields,
}).partial().refine(courierPinned, COURIER_PIN_ERROR).refine(livePriced, LIVE_PRICE_ERROR)
  .refine(collectIsFlat, COLLECT_FLAT_ERROR);

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("shipping");
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = UpdateShippingMethodSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data, error } = await admin
    .from("shipping_methods")
    .update(parsed.data)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    const isDup = /duplicate key|unique/i.test(error.message);
    return NextResponse.json(
      { error: isDup ? "A shipping method with this slug already exists" : error.message },
      { status: isDup ? 409 : 500 }
    );
  }
  invalidateTag("shipping-methods");
  return NextResponse.json({ ok: true, row: data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("shipping");
  if (denied) return denied;

  const { id } = await params;
  const admin = supabaseAdmin();
  const { error } = await admin.from("shipping_methods").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  invalidateTag("shipping-methods");
  return NextResponse.json({ ok: true });
}
