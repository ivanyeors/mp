import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { adminCanSeeCost, requireAdmin } from "@/lib/auth/admin";
import { withoutCostPrice } from "@/lib/ecommerce/admin/products";
import { syncProductToStripeSafe } from "@/lib/stripe/sync";
import { stripePriceIdColumn } from "@/lib/stripe/mode";

export const runtime = "nodejs";

const COST_REFUSED = "Only staff with Costings access can set a cost price.";

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
}).partial();

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; variantId: string }> }) {
  const denied = await requireAdmin("products");
  if (denied) return denied;

  const { id, variantId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = UpdateVariantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const canSeeCost = await adminCanSeeCost();
  if (!canSeeCost && parsed.data.cost_price != null) {
    return NextResponse.json({ error: COST_REFUSED }, { status: 403 });
  }

  const admin = supabaseAdmin();

  const { data: product } = await admin.from("products").select("is_auto_generated").eq("id", id).single();
  const update = { ...parsed.data };
  if (!canSeeCost) delete update.cost_price;
  if (product?.is_auto_generated) {
    delete update.price;
    delete update.cost_price;
    delete update.compare_at_price;
  }

  const { data, error } = await admin
    .from("product_variants")
    .update(update)
    .eq("id", variantId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const stripe =
    data.price > 0 && data.is_active !== false
      ? await syncProductToStripeSafe(id)
      : undefined;

  const freshPriceId = stripe?.result?.variants.find((v) => v.id === variantId)?.stripePriceId;
  const row = freshPriceId ? { ...data, [stripePriceIdColumn()]: freshPriceId } : data;

  return NextResponse.json({
    ok: true,
    row: canSeeCost ? row : withoutCostPrice(row),
    stripe: stripe && {
      synced: stripe.synced,
      error: stripe.error,
      pricesInPlace: stripe.pricesInPlace,
      notices: stripe.notices,
    },
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; variantId: string }> }) {
  const denied = await requireAdmin("products");
  if (denied) return denied;

  const { variantId } = await params;
  const admin = supabaseAdmin();
  const { error } = await admin.from("product_variants").delete().eq("id", variantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
