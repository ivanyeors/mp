import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireSettingsAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

const UpdateVariantSchema = z.object({
  sku: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  option1: z.string().nullable().optional(),
  option2: z.string().nullable().optional(),
  option3: z.string().nullable().optional(),
  price: z.number().min(0).optional(),
  compare_at_price: z.number().min(0).nullable().optional(),
  cost_price: z.number().min(0).nullable().optional(),
  currency: z.string().optional(),
  stock_quantity: z.number().int().optional(),
  track_inventory: z.boolean().optional(),
  weight_grams: z.number().int().nullable().optional(),
  image_url: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  position: z.number().int().optional(),
  stripe_price_id: z.string().nullable().optional(),
}).partial();

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; variantId: string }> }) {
  const denied = await requireSettingsAuth();
  if (denied) return denied;

  const { variantId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = UpdateVariantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("product_variants")
    .update(parsed.data)
    .eq("id", variantId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, row: data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; variantId: string }> }) {
  const denied = await requireSettingsAuth();
  if (denied) return denied;

  const { variantId } = await params;
  const admin = supabaseAdmin();
  const { error } = await admin.from("product_variants").delete().eq("id", variantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
