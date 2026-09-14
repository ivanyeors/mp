import { NextResponse } from "next/server";
import { loadComposedSellable, type ComposedSellableKey } from "@/lib/results/composed-sellable";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getFillingRecommendation, getRecommendationFromMeasurements, getBolsterRecommendation, getBomTemplates, getAvailableFillings, getSizeBallparkFromMeasurements, getSizeBallparkFromPreferences } from "@/lib/shop/customization-llm";
import { getAvailableComponents, validateCustomizationConfig, fetchOverlayMap } from "@/lib/shop/customization-inventory";
import { customizationDelta, priceCustomizedBuild } from "@/lib/shop/customization-price";
import type { BolsterVariant, ConfigLine, FillingLine } from "@/lib/types/customization";
import {
  incompleteEngineInputs,
  measurementPrefsToEngineInputs,
} from "@/lib/rules-engine/legacy-inputs";

export const runtime = "nodejs";

// ─── GET RECOMMENDATION ────────────────────────────────────

const RecommendRequestSchema = z.object({
  /** Online purchase path (mp-config/mbolster-config): size ballpark only, no hardcoded fillings. */
  purpose: z.enum(["ballpark", "full"]).optional(),
  preferences: z.object({
    sleep_position: z.enum(["side", "back", "stomach", "mixed"]),
    body_type: z.enum(["petite", "average", "large"]),
    firmness: z.enum(["soft", "medium-soft", "medium", "medium-firm", "firm"]),
    notes: z.string().optional(),
  }),
});

const MeasurementRecommendRequestSchema = z.object({
  purpose: z.enum(["ballpark", "full"]).optional(),
  measurement_preferences: z.object({
    measurements: z.object({
      shoulder_length_cm: z.number().positive(),
      neck_to_back_cm: z.number().positive(),
      head_to_back_cm: z.number().positive(),
      neck_length_cm: z.number().positive(),
    }),
    demographics: z.object({
      gender: z.string(),
      age_group: z.string(),
    }),
    health: z.object({
      blood_pressure: z.string(),
      ear_discomfort_side_sleep: z.boolean(),
      bed_firmness: z.string(),
      acid_reflux: z.boolean(),
      sleep_pain_areas: z.array(z.string()),
      sleep_position_type: z.array(z.string()),
      uses_bolster: z.boolean(),
    }),
  }),
  /**
   * Finishing an assigned build (ADR 0017): offer and price the size×tier Staff
   * assigned, not the engine's ballpark. Catalog data only — nothing is written,
   * and the price is re-derived server-side at finish.
   */
  assigned: z
    .object({
      size: z.enum(["XS", "S", "M", "L", "XL"]),
      tier: z.enum(["basic", "premium"]),
    })
    .optional(),
});

const BolsterRecommendRequestSchema = z.object({
  bolster_preferences: z.object({
    height_cm: z.number().positive(),
    sleep_position: z.string(),
  }),
});

export async function POST(req: Request) {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  if (action === "apply") {
    return handleApply(req);
  }

  return handleRecommend(req);
}

async function handleRecommend(req: Request) {
  const body = await req.json().catch(() => null);

  // Try measurement-based input first, then bolster, then simple preferences
  const measurementParsed = MeasurementRecommendRequestSchema.safeParse(body);
  const bolsterParsed = BolsterRecommendRequestSchema.safeParse(body);
  const simpleParsed = RecommendRequestSchema.safeParse(body);

  if (!measurementParsed.success && !bolsterParsed.success && !simpleParsed.success) {
    return NextResponse.json({ error: simpleParsed.error?.flatten() ?? "Invalid request" }, { status: 400 });
  }

  try {
    const admin = supabaseAdmin();

    // --- Bolster flow ---
    if (bolsterParsed.success) {
      const missingBolster = incompleteEngineInputs("mbolster", {
        height_cm: bolsterParsed.data.bolster_preferences.height_cm,
      });
      if (missingBolster.length > 0) {
        return NextResponse.json(
          { error: "Incomplete engine inputs", missing: missingBolster },
          { status: 400 },
        );
      }
      const recommendation = await getBolsterRecommendation(bolsterParsed.data.bolster_preferences);

      // Engine returns length keys; letter sizes (S/M/L) still accepted from legacy bootstrap.
      const sizeToVariant: Record<string, string> = {
        S: "short",
        M: "medium",
        L: "long",
        short: "short",
        medium: "medium",
        long: "long",
      };
      const fromRecord = recommendation.recommendation_record?.size;
      const bolsterVariant =
        (fromRecord && sizeToVariant[String(fromRecord)]) ||
        sizeToVariant[recommendation.recommended_size] ||
        "medium";

      // Find the bolster ecommerce product (by product_type or slug pattern)
      const { data: bolsterProducts } = await admin
        .from("products")
        .select("id, slug, product_type")
        .eq("product_type", "bolster")
        .eq("status", "active");

      const bolsterProduct = bolsterProducts?.[0] ?? null;

      // Find the variant matching this size
      let variant = null;
      if (bolsterProduct) {
        const { data: variants } = await admin
          .from("product_variants")
          .select("id, product_id, price, currency, title, sku")
          .eq("product_id", bolsterProduct.id)
          .eq("is_active", true);

        // Match variant by title containing size or variant name
        variant = (variants ?? []).find((v: { title: string | null; sku: string | null }) =>
          v.title?.toLowerCase().includes(recommendation.recommended_size.toLowerCase()) ||
          v.title?.toLowerCase().includes(bolsterVariant) ||
          v.sku?.toLowerCase().includes(bolsterVariant)
        ) ?? variants?.[0] ?? null;
      }

      // Get bolster BOM items for component display
      const { data: bomLines } = await admin
        .from("bolster_bom_lines")
        .select("item_id, quantity")
        .eq("variant", bolsterVariant);

      const bomItemIds = (bomLines ?? []).map((bl: { item_id: number }) => bl.item_id);
      const bomMap = new Map<number, number>(
        (bomLines ?? []).map((bl: { item_id: number; quantity: number }) => [bl.item_id, bl.quantity])
      );

      // Get bolster-compatible items (cases, protectors, covers)
      const { data: items } = await admin
        .from("items")
        .select("id, category, subtype, name, size")
        .eq("is_active", true)
        .in("category", ["bolster_case", "bolster_protector", "cover", "case", "protector", "packaging"]);

      // Filter to bolster items + any items in the BOM
      const relevantItems = (items ?? []).filter(
        (i: { id: number; category: string }) =>
          i.category.startsWith("bolster_") || bomItemIds.includes(i.id)
      );

      const itemIds = relevantItems.map((i: { id: number }) => i.id);

      // Get stock + prices
      const { data: balances } = itemIds.length > 0
        ? await admin.from("inventory_balances").select("item_id, on_hand").in("item_id", itemIds)
        : { data: [] };
      const { data: prices } = itemIds.length > 0
        ? await admin.from("item_prices").select("item_id, msrp").in("item_id", itemIds)
        : { data: [] };

      const stockMap = new Map<number, number>(
        (balances ?? []).map((b: { item_id: number; on_hand: number }) => [b.item_id, b.on_hand])
      );
      const priceMap = new Map<number, number>(
        (prices ?? []).map((p: { item_id: number; msrp: number | null }) => [p.item_id, p.msrp ?? 0])
      );

      const overlayMap = await fetchOverlayMap(admin, itemIds);

      const toOption = (i: { id: number; category: string; subtype: string | null; name: string; size: string | null }) => ({
        item_id: i.id,
        category: i.category.replace("bolster_", ""),
        name: i.name,
        subtype: i.subtype ?? undefined,
        size: i.size ?? undefined,
        stock_available: stockMap.get(i.id) ?? 0,
        unit_price: priceMap.get(i.id) ?? 0,
        base_quantity: bomMap.get(i.id) ?? 0,
        overlay: overlayMap.get(i.id) ?? null,
      });

      const components = {
        covers: relevantItems.filter((i: { category: string }) => i.category === "cover").map(toOption),
        cases: relevantItems.filter((i: { category: string }) => i.category === "bolster_case" || i.category === "case").map(toOption),
        protectors: relevantItems.filter((i: { category: string }) => i.category === "bolster_protector" || i.category === "protector").map(toOption),
        packaging: relevantItems.filter((i: { category: string }) => i.category === "packaging").map(toOption),
      };

      // Fetch bolster buildable counts per variant
      const { data: bolsterBuildable } = await admin
        .from("bolster_buildable")
        .select("variant, buildable");
      const buildable_counts: Record<string, number> = {};
      for (const row of bolsterBuildable ?? []) {
        buildable_counts[row.variant] = row.buildable ?? 0;
      }
      const composed_buildable = buildable_counts[bolsterVariant] ?? 0;

      // RE slice 07: length-scoped Filling Templates + spatial placements +
      // color overrides so the completed preview can render the read-only x-ray.
      const { data: fillingTemplates } = await admin
        .from("bom_templates")
        .select("id, name")
        .eq("kind", "bolster")
        .eq("key", bolsterVariant)
        .eq("role", "filling")
        .eq("is_active", true)
        .order("name");
      const { data: tplPlacements } = await admin
        .from("bolster_template_placements")
        .select("template_id, slot, item_id")
        .in("template_id", (fillingTemplates ?? []).map((t: { id: number }) => t.id))
        .order("slot");
      const { data: colorOverrides } = await admin
        .from("filling_color_overrides")
        .select("subtype, color");
      const availableFillings = await getAvailableFillings();

      return NextResponse.json({
        ok: true,
        product_type: "bolster",
        bolster_variant: bolsterVariant,
        ecom_product: bolsterProduct ? {
          id: bolsterProduct.id,
          slug: bolsterProduct.slug,
        } : null,
        recommendation,
        graph_version_id: recommendation.graph_version_id ?? null,
        recommendation_record: recommendation.recommendation_record ?? null,
        pillow_product: {
          id: 0,
          size: recommendation.recommended_size,
          kind: "basic",
        },
        variant: variant ? {
          id: variant.id,
          product_id: variant.product_id,
          price: variant.price,
          currency: variant.currency,
        } : null,
        components,
        templates: (fillingTemplates ?? []).map((t: { id: number; name: string }) => ({
          id: t.id,
          name: t.name,
          lines: [], // bolster fillings are spatial-only (ADR 0008) — no flat lines
          placements: (tplPlacements ?? []).filter(
            (p: { template_id: number }) => p.template_id === t.id,
          ),
        })),
        available_fillings: availableFillings,
        color_overrides: colorOverrides ?? [],
        buildable_counts,
        composed_buildable,
      });
    }

    // --- Pillow flow (measurement-based or simple preferences) ---
    if (measurementParsed.success) {
      const missing = incompleteEngineInputs(
        "premium-mpillow",
        measurementPrefsToEngineInputs(measurementParsed.data.measurement_preferences),
      );
      if (missing.length > 0) {
        return NextResponse.json(
          { error: "Incomplete engine inputs", missing },
          { status: 400 },
        );
      }
    }

    const ballpark =
      measurementParsed.success
        ? measurementParsed.data.purpose === "ballpark"
        : simpleParsed.data!.purpose === "ballpark";

    const engineRecommendation = measurementParsed.success
      ? ballpark
        ? await getSizeBallparkFromMeasurements(measurementParsed.data.measurement_preferences)
        : await getRecommendationFromMeasurements(measurementParsed.data.measurement_preferences)
      : ballpark
        ? getSizeBallparkFromPreferences(simpleParsed.data!.preferences)
        : await getFillingRecommendation(simpleParsed.data!.preferences);
    const assigned = measurementParsed.success ? measurementParsed.data.assigned : undefined;
    const recommendation = assigned
      ? {
          ...engineRecommendation,
          recommended_size: assigned.size,
          recommended_kind: assigned.tier,
        }
      : engineRecommendation;

    // Resolve the pillow_product_id for the recommended size/tier (Premium flow → premium)
    const { data: pillowProduct } = await admin
      .from("pillow_products")
      .select("id, size, kind")
      .eq("size", recommendation.recommended_size)
      .eq("kind", recommendation.recommended_kind)
      .eq("is_active", true)
      .single();

    if (!pillowProduct) {
      return NextResponse.json({
        error: `No pillow product found for size ${recommendation.recommended_size}`,
      }, { status: 404 });
    }

    // Find the matching ecommerce product variant
    const { data: variant } = await admin
      .from("product_variants")
      .select("id, product_id, price, currency")
      .eq("pillow_product_id", pillowProduct.id)
      .eq("is_active", true)
      .single();

    // Get available components for this pillow
    const components = await getAvailableComponents(pillowProduct.id);

    // Everything the preview needs to price a build with the SAME function the hold
    // route and assign use. Before this the preview showed `variant.price` (the shelf
    // price) while the server charged shelf + cover + case.
    const composed = await loadComposedSellable(admin, {
      productType: "pillow",
      size: recommendation.recommended_size,
      tier: recommendation.recommended_kind,
    });

    // Get BOM templates as alternatives
    const templates = await getBomTemplates(
      pillowProduct.kind ?? "basic",
      pillowProduct.size
    );

    // Get available fillings for display
    const fillings = await getAvailableFillings();

    // RE slice 07: spatial placements + color overrides so the completed
    // preview can render the recommended template in the read-only x-ray.
    const { data: tplPlacements } = await admin
      .from("filling_template_placements")
      .select("template_id, section, sub_section, slot, item_id, row_index")
      .in("template_id", templates.map((t) => t.id))
      .order("slot");
    const { data: colorOverrides } = await admin
      .from("filling_color_overrides")
      .select("subtype, color");

    // Fetch pillow buildable counts; composed uses product_id (kind×size).
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

    return NextResponse.json({
      ok: true,
      product_type: "pillow",
      recommendation,
      graph_version_id:
        "graph_version_id" in recommendation ? recommendation.graph_version_id ?? null : null,
      // An assigned build is past the engine: its record would describe a size
      // Staff may have overridden and re-open a Flow route decision already made.
      recommendation_record:
        !assigned && "recommendation_record" in recommendation
          ? (recommendation as { recommendation_record?: unknown }).recommendation_record ?? null
          : null,
      pillow_product: {
        id: pillowProduct.id,
        size: pillowProduct.size,
        kind: pillowProduct.kind,
      },
      variant: variant ? {
        id: variant.id,
        product_id: variant.product_id,
        price: variant.price,
        currency: variant.currency,
      } : null,
      pricing: composed.ok
        ? {
            msrp_by_family: composed.sellable.msrpByFamily,
            default_cover: composed.sellable.defaultCover,
            default_case: composed.sellable.defaultCase,
            case_options: composed.sellable.caseOptions,
            cover_options: composed.sellable.coverOptions,
            shelf_price: composed.sellable.msrp,
          }
        : null,
      components,
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        lines: t.lines,
        placements: (tplPlacements ?? []).filter(
          (p: { template_id: number }) => p.template_id === t.id,
        ),
      })),
      available_fillings: fillings,
      color_overrides: colorOverrides ?? [],
      buildable_counts,
      composed_buildable,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get recommendation";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// ─── APPLY CUSTOMIZATION ──────────────────────────────────

const ApplyRequestSchema = z.object({
  variant_id: z.string().uuid(),
  product_type: z.enum(["pillow", "bolster"]).default("pillow"),
  pillow_product_id: z.number().int().positive().optional(),
  bolster_variant: z.enum(["short", "medium", "long"]).optional(),
  ecom_product_id: z.string().uuid().optional(),
  filling_lines: z.array(z.object({
    item_id: z.number().int().positive(),
    subtype: z.string(),
    name: z.string(),
    quantity: z.number().int().positive(),
  })).optional().default([]),
  cover_variant: z.string().nullish(),
  case_variant: z.string().nullish(),
  component_quantities: z.array(z.object({
    item_id: z.number().int().positive(),
    category: z.string(),
    subtype: z.string().optional(),
    name: z.string(),
    size: z.string().optional(),
    quantity: z.number().int().min(0),
    is_addon: z.boolean(),
    price_delta: z.number().min(0),
  })).optional().default([]),
  upsells: z.array(z.object({
    item_id: z.number().int().positive(),
    name: z.string(),
    discount_pct: z.number().min(0).max(100),
    original_price: z.number().min(0),
    price: z.number().min(0),
    quantity: z.number().int().positive(),
  })).optional().default([]),
  bom_template_id: z.number().int().positive().optional(),
  llm_metadata: z.record(z.string(), z.unknown()).optional(),
});

const SIZE_TO_BOLSTER_VARIANT: Record<string, BolsterVariant> = {
  S: "short",
  M: "medium",
  L: "long",
  short: "short",
  medium: "medium",
  long: "long",
};

function resolveBolsterVariantFromVariant(
  explicit: BolsterVariant | undefined,
  variant: { title: string | null; option1: string | null; sku: string | null }
): BolsterVariant | null {
  if (explicit) return explicit;

  for (const field of [variant.option1, variant.title, variant.sku]) {
    if (!field) continue;
    const lower = field.toLowerCase();
    if (lower.includes("short") || /\bs\b/.test(lower)) return "short";
    if (lower.includes("long") || /\bl\b/.test(lower)) return "long";
    if (lower.includes("medium") || /\bm\b/.test(lower)) return "medium";
    const mapped = SIZE_TO_BOLSTER_VARIANT[field.toUpperCase()];
    if (mapped) return mapped;
  }

  return null;
}

/**
 * The Costings price of a customized build, and the signed delta from the shelf
 * price its storefront variant carries.
 *
 * Both apply handlers go through here so neither can grow its own arithmetic again.
 * The client's `component_quantities[].price_delta` is ignored: it is browser input
 * on a money path.
 */
async function priceApply(
  admin: ReturnType<typeof supabaseAdmin>,
  key: ComposedSellableKey,
  lines: ConfigLine[],
): Promise<{ ok: true; delta: number; subtotal: number } | { ok: false; error: string }> {
  const composed = await loadComposedSellable(admin, key);
  if (!composed.ok) return { ok: false, error: composed.error };
  const sellable = composed.sellable;
  if (sellable.msrp == null) {
    return {
      ok: false,
      error: sellable.priceFault?.error ?? "This build has no Costings price",
    };
  }

  const ids = [...new Set(lines.map((l) => l.item_id))];
  const { data: prices } = ids.length
    ? await admin.from("item_prices").select("item_id, msrp").in("item_id", ids)
    : { data: [] as Array<{ item_id: number; msrp: number | null }> };
  // Seeded with null so an item with no `item_prices` row stays unpriced rather than
  // reading as absent-and-therefore-free.
  const msrpByItem = new Map<number, number | null>(ids.map((id) => [id, null]));
  for (const p of prices ?? []) {
    msrpByItem.set(Number(p.item_id), p.msrp == null ? null : Number(p.msrp));
  }

  const result = priceCustomizedBuild({
    pricing: {
      msrp_by_family: sellable.msrpByFamily,
      default_cover: sellable.defaultCover,
      default_case: sellable.defaultCase,
      case_options: sellable.caseOptions,
      cover_options: sellable.coverOptions,
      shelf_price: sellable.msrp,
    },
    lines,
    baseQuantityByItem: new Map(sellable.bomLines.map((l) => [l.item_id, l.quantity])),
    msrpByItem,
  });
  if (!result.ok) return { ok: false, error: result.error };

  const delta = customizationDelta(result, sellable.msrp);
  if (delta == null) return { ok: false, error: "This build has no Costings price" };
  return { ok: true, delta, subtotal: result.subtotal };
}

async function handleApply(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = ApplyRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const {
    variant_id,
    product_type,
    pillow_product_id,
    bolster_variant,
    ecom_product_id,
    filling_lines,
    cover_variant,
    case_variant,
    component_quantities,
    bom_template_id,
    llm_metadata,
  } = parsed.data;

  const admin = supabaseAdmin();

  if (product_type === "bolster") {
    return handleApplyBolster({
      admin,
      variant_id,
      bolster_variant,
      ecom_product_id,
      filling_lines,
      cover_variant: cover_variant ?? undefined,
      case_variant: case_variant ?? undefined,
      component_quantities,
      bom_template_id,
      llm_metadata,
    });
  }

  if (!pillow_product_id) {
    return NextResponse.json({ error: "pillow_product_id is required for pillow customizations" }, { status: 400 });
  }

  // Validate variant exists and matches pillow_product_id
  const { data: variant } = await admin
    .from("product_variants")
    .select("id, pillow_product_id")
    .eq("id", variant_id)
    .single();

  if (!variant || variant.pillow_product_id !== pillow_product_id) {
    return NextResponse.json({ error: "Invalid variant or pillow product mismatch" }, { status: 400 });
  }

  // Validate filling items are actual filling items
  const fillingItemIds = filling_lines.map((fl) => fl.item_id);
  if (fillingItemIds.length > 0) {
    const { data: fillingItems } = await admin
      .from("items")
      .select("id, category")
      .in("id", fillingItemIds);

    const nonFillings = (fillingItems ?? []).filter((i: { category: string }) => i.category !== "filling");
    if (nonFillings.length > 0) {
      return NextResponse.json({ error: "Invalid items in filling lines — only fillings allowed" }, { status: 400 });
    }
  }

  // Validate inventory availability
  const validation = await validateCustomizationConfig({
    product_type: "pillow",
    pillow_product_id,
    filling_lines: filling_lines as FillingLine[],
    component_quantities: component_quantities as ConfigLine[],
    orderQuantity: 1,
  });

  if (!validation.valid) {
    return NextResponse.json({
      error: "Insufficient inventory",
      shortages: validation.shortages,
    }, { status: 400 });
  }

  // Price from Costings, through the same rule the preview and /mp-config use.
  const { data: pillowProductRow } = await admin
    .from("pillow_products")
    .select("size, kind")
    .eq("id", pillow_product_id)
    .maybeSingle();
  if (!pillowProductRow) {
    return NextResponse.json({ error: "Unknown pillow product" }, { status: 400 });
  }

  const quote = await priceApply(
    admin,
    {
      productType: "pillow",
      size: String(pillowProductRow.size),
      tier: String(pillowProductRow.kind ?? "basic"),
    },
    component_quantities as ConfigLine[],
  );
  // Refusing beats guessing: a build we cannot price from Costings must not reach
  // checkout on a stale shelf price.
  if (!quote.ok) {
    return NextResponse.json({ error: quote.error }, { status: 400 });
  }
  const totalAddonPrice = quote.delta;

  const fillingDesc = filling_lines.map((f) => `${f.quantity}× ${f.subtype}`).join(", ");
  const parts: string[] = [];
  if (fillingDesc) parts.push(fillingDesc);
  if (cover_variant) parts.push(`Cover: ${cover_variant}`);
  if (case_variant) parts.push(`Case: ${case_variant}`);
  const summary = parts.join(" | ");

  const { data: config, error: configError } = await admin
    .from("customization_configs")
    .insert({
      product_type: "pillow",
      pillow_product_id,
      bolster_variant: null,
      ecom_product_id: null,
      bom_template_id: bom_template_id ?? null,
      config_lines: component_quantities,
      filling_lines,
      cover_variant: cover_variant ?? null,
      case_variant: case_variant ?? null,
      llm_metadata: llm_metadata ?? {},
      summary,
      total_addon_price: totalAddonPrice,
    })
    .select("id")
    .single();

  if (configError || !config) {
    return NextResponse.json({ error: "Failed to save customization" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    customization_id: config.id,
    summary,
    total_addon_price: totalAddonPrice,
  });
}

async function handleApplyBolster({
  admin,
  variant_id,
  bolster_variant,
  ecom_product_id,
  filling_lines,
  cover_variant,
  case_variant,
  component_quantities,
  bom_template_id,
  llm_metadata,
}: {
  admin: ReturnType<typeof supabaseAdmin>;
  variant_id: string;
  bolster_variant?: BolsterVariant;
  ecom_product_id?: string;
  filling_lines: { item_id: number; subtype: string; name: string; quantity: number }[];
  cover_variant?: string;
  case_variant?: string;
  component_quantities: ConfigLine[];
  bom_template_id?: number;
  llm_metadata?: Record<string, unknown>;
}) {
  if (!ecom_product_id) {
    return NextResponse.json({ error: "ecom_product_id is required for bolster customizations" }, { status: 400 });
  }

  const { data: product } = await admin
    .from("products")
    .select("id, product_type")
    .eq("id", ecom_product_id)
    .single();

  if (!product || product.product_type !== "bolster") {
    return NextResponse.json({ error: "Invalid bolster product" }, { status: 400 });
  }

  const { data: variant } = await admin
    .from("product_variants")
    .select("id, product_id, title, option1, sku")
    .eq("id", variant_id)
    .single();

  if (!variant || variant.product_id !== ecom_product_id) {
    return NextResponse.json({ error: "Invalid variant or product mismatch" }, { status: 400 });
  }

  const resolvedBolsterVariant = resolveBolsterVariantFromVariant(bolster_variant, variant);
  if (!resolvedBolsterVariant) {
    return NextResponse.json({ error: "Could not resolve bolster variant" }, { status: 400 });
  }

  if (filling_lines.length > 0) {
    return NextResponse.json({ error: "Bolster customizations do not support filling lines" }, { status: 400 });
  }

  const validation = await validateCustomizationConfig({
    product_type: "bolster",
    bolster_variant: resolvedBolsterVariant,
    filling_lines: [],
    component_quantities,
    orderQuantity: 1,
  });

  if (!validation.valid) {
    return NextResponse.json({
      error: "Insufficient inventory",
      shortages: validation.shortages,
    }, { status: 400 });
  }

  const quote = await priceApply(
    admin,
    { productType: "bolster", length: resolvedBolsterVariant },
    component_quantities,
  );
  if (!quote.ok) {
    return NextResponse.json({ error: quote.error }, { status: 400 });
  }
  const totalAddonPrice = quote.delta;

  const parts: string[] = [`Bolster: ${resolvedBolsterVariant}`];
  if (cover_variant) parts.push(`Cover: ${cover_variant}`);
  if (case_variant) parts.push(`Case: ${case_variant}`);
  const summary = parts.join(" | ");

  const { data: config, error: configError } = await admin
    .from("customization_configs")
    .insert({
      product_type: "bolster",
      pillow_product_id: null,
      bolster_variant: resolvedBolsterVariant,
      ecom_product_id,
      bom_template_id: bom_template_id ?? null,
      config_lines: component_quantities,
      filling_lines: [],
      cover_variant: cover_variant ?? null,
      case_variant: case_variant ?? null,
      llm_metadata: llm_metadata ?? {},
      summary,
      total_addon_price: totalAddonPrice,
    })
    .select("id")
    .single();

  if (configError || !config) {
    return NextResponse.json({ error: "Failed to save customization" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    customization_id: config.id,
    summary,
    total_addon_price: totalAddonPrice,
  });
}
