import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  inferSizeFromMeasurements,
  inferTierFromQuestions,
  type PillowSize,
  type PillowTier,
} from "@/lib/results/instore-ballpark";
import {
  getDiscoverySourceCatalog,
  resolveDiscoverySourceLabel,
} from "@/lib/discovery-source";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";

type BomLineRow = {
  quantity: string | number;
  item: {
    id: number;
    category: string;
    name: string;
    size: string | null;
    subtype: string | null;
  } | null;
};

export const runtime = "nodejs";

const ParamsSchema = z.object({ id: z.string().uuid() });

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsedParams = ParamsSchema.safeParse({ id });
  if (!parsedParams.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: responseRow, error: rErr } = await admin
    .from("mp_config_responses")
    .select(
      "id,data,is_final,measured_by_type,measured_by_staff_id,source,order_id,order_item_id,created_at,updated_at,status,product_type,suggested_size,suggested_tier,suggested_length,assigned_size,assigned_tier,assigned_length,filling_template_id,preference_lines,addon_lines,shipping_method,authorized_amount,final_amount,currency,payment_intent_id,customer_email,customer_phone,discovery_source,discovery_source_other,is_pre_order",
    )
    .eq("id", parsedParams.data.id)
    .maybeSingle();

  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
  if (!responseRow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const catalog = await getDiscoverySourceCatalog();
  const discovery_source_label = resolveDiscoverySourceLabel(
    catalog,
    responseRow.discovery_source,
    DEFAULT_LOCALE,
  );

  // Fetch linked order number if present
  let orderNumber: string | null = null;
  if (responseRow.order_id) {
    const { data: orderRow } = await admin
      .from("orders")
      .select("order_number")
      .eq("id", responseRow.order_id)
      .maybeSingle();
    orderNumber = orderRow?.order_number ?? null;
  }

  const data = (responseRow.data ?? {}) as Record<string, unknown>;
  const sizeGuess = inferSizeFromMeasurements(data);
  const tierGuess = inferTierFromQuestions(data);

  // Try to find an active product matching the recommendation; if missing, fall back to basic.
  const tryFindProduct = async (tier: PillowTier) => {
    return await admin
      .from("pillow_products")
      .select("id,size,kind,is_active")
      .eq("size", sizeGuess.size)
      .eq("kind", tier)
      .eq("is_active", true)
      .maybeSingle();
  };

  const { data: productPreferred, error: pErr1 } = await tryFindProduct(tierGuess.tier);
  if (pErr1) return NextResponse.json({ error: pErr1.message }, { status: 500 });

  let product = productPreferred as { id: number; size: PillowSize; kind: PillowTier } | null;
  const productReasons: string[] = [];
  if (!product && tierGuess.tier === "premium") {
    const { data: fallback, error: pErr2 } = await tryFindProduct("basic");
    if (pErr2) return NextResponse.json({ error: pErr2.message }, { status: 500 });
    if (fallback) {
      product = fallback as { id: number; size: PillowSize; kind: PillowTier };
      productReasons.push("Preferred premium product not available; fell back to basic for this size");
    }
  }

  let bomLines: BomLineRow[] = [];
  if (product?.id) {
    const { data: lines, error: bErr } = await admin
      .from("bom_lines")
      .select("quantity,item:items(id,category,name,size,subtype)")
      .eq("product_id", product.id);
    if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });
    bomLines = (lines ?? []) as unknown as BomLineRow[];
  }

  return NextResponse.json({
    ok: true,
    response: {
      ...responseRow,
      discovery_source_label,
    },
    order_number: orderNumber,
    suggestion: {
      recommended: {
        size: sizeGuess.size,
        tier: tierGuess.tier,
      },
      product: product
        ? { id: product.id, size: product.size, tier: product.kind }
        : null,
      bom: bomLines,
      reasons: [...sizeGuess.reasons, ...tierGuess.reasons, ...productReasons],
    },
  });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsedParams = ParamsSchema.safeParse({ id });
  if (!parsedParams.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const admin = supabaseAdmin();
  const { error } = await admin.from("mp_config_responses").delete().eq("id", parsedParams.data.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

