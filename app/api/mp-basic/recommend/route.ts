import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recommendBasicMpillow } from "@/lib/mp-basic/recommend";
import { getAvailableComponents } from "@/lib/shop/customization-inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RecommendSchema = z.object({
  shoulderLength: z.string().min(1),
  name: z.string().optional(),
  gender: z.string().optional(),
  ageGroup: z.string().optional(),
  bloodPressureLevel: z.string().optional(),
  bedFirmness: z.string().optional(),
  earDiscomfortSideSleep: z.string().optional(),
  acidReflux: z.string().optional(),
  sleepPainAreas: z.array(z.string()).optional(),
  sleepPositionType: z.array(z.string()).optional(),
  usesBolster: z.string().optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = RecommendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const shoulderCm = Number.parseFloat(parsed.data.shoulderLength);
  if (!Number.isFinite(shoulderCm) || shoulderCm <= 0) {
    return NextResponse.json({ error: "shoulderLength must be a positive number (cm)" }, { status: 400 });
  }

  try {
    const recommendation = recommendBasicMpillow(parsed.data);
    const admin = supabaseAdmin();

    const { data: pillowProduct } = await admin
      .from("pillow_products")
      .select("id, size, kind")
      .eq("size", recommendation.recommended_size)
      .eq("kind", "basic")
      .eq("is_active", true)
      .single();

    if (!pillowProduct) {
      return NextResponse.json(
        { error: `No basic pillow product found for size ${recommendation.recommended_size}` },
        { status: 404 },
      );
    }

    const { data: variant } = await admin
      .from("product_variants")
      .select("id, product_id, price, currency")
      .eq("pillow_product_id", pillowProduct.id)
      .eq("is_active", true)
      .single();

    const components = await getAvailableComponents(pillowProduct.id);

    const { data: pillowBuildable } = await admin
      .from("product_buildable")
      .select("product_id, size, buildable");
    const buildable_counts: Record<string, number> = {};
    for (const row of pillowBuildable ?? []) {
      buildable_counts[row.size] = row.buildable ?? 0;
    }
    // Prefer product_id so basic vs premium of the same size do not collide.
    const composed_buildable = Number(
      pillowBuildable?.find((r) => r.product_id === pillowProduct.id)?.buildable ??
        buildable_counts[pillowProduct.size] ??
        0,
    );

    return NextResponse.json({
      ok: true,
      product_type: "pillow",
      recommendation: {
        recommended_size: recommendation.recommended_size,
        recommended_kind: recommendation.recommended_kind,
        filling_lines: [],
        summary: recommendation.summary,
        explanation: recommendation.explanation,
        reasons: recommendation.reasons,
      },
      pillow_product: {
        id: pillowProduct.id,
        size: pillowProduct.size,
        kind: pillowProduct.kind,
      },
      variant: variant
        ? {
            id: variant.id,
            product_id: variant.product_id,
            price: variant.price,
            currency: variant.currency,
          }
        : null,
      components,
      templates: [],
      available_fillings: [],
      buildable_counts,
      composed_buildable,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get basic recommendation";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
