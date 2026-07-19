import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  inputsFromBasicShoulder,
  recommendWithEngine,
  toPersistedRecommendationRecord,
} from "@/lib/rules-engine";
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
    const engineResult = await recommendWithEngine(
      "basic-mpillow",
      inputsFromBasicShoulder(shoulderCm),
    );
    if ("error" in engineResult) {
      return NextResponse.json(
        { error: engineResult.error, missing: engineResult.missing },
        { status: 422 },
      );
    }

    const recommended_size = String(engineResult.size ?? "M");
    const recommended_kind = engineResult.soldTier ?? "basic";
    const admin = supabaseAdmin();

    const { data: pillowProduct } = await admin
      .from("pillow_products")
      .select("id, size, kind")
      .eq("size", recommended_size)
      .eq("kind", recommended_kind)
      .eq("is_active", true)
      .single();

    if (!pillowProduct) {
      return NextResponse.json(
        { error: `No basic pillow product found for size ${recommended_size}` },
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
    const composed_buildable = Number(
      pillowBuildable?.find((r) => r.product_id === pillowProduct.id)?.buildable ??
        buildable_counts[pillowProduct.size] ??
        0,
    );

    const reasons = [
      `Shoulder length ${shoulderCm}cm → ${recommended_size}`,
      "Basic Mpillow flow — tier locked to basic",
    ];

    return NextResponse.json({
      ok: true,
      product_type: "pillow",
      recommendation: {
        recommended_size,
        recommended_kind,
        filling_lines: [],
        summary: `Size ${recommended_size} — Basic`,
        explanation: `Based on your shoulder measurement, we recommend Size ${recommended_size} Basic Mpillow. ${reasons.join(". ")}.`,
        reasons,
        graph_version_id: engineResult.graphVersionId,
      },
      recommendation_record: toPersistedRecommendationRecord(engineResult),
      graph_version_id: engineResult.graphVersionId,
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
