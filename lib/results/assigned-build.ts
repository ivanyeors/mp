/** Load assembled build + stock + pricing for an assigned Result. */

import { assembleBuild, findStockShortages, type BuildLine } from "@/lib/build-assembly";
import { priceResult, type PriceResultOutput } from "@/lib/result-pricing";
import { placedChargeLines, priceComposedBuild, resolvePreferences } from "@/lib/pricing/composed-price";
import { calculateShippingRate } from "@/lib/ecommerce/shipping";
import { computeTax, resolveTaxRuleForRegion } from "@/lib/ecommerce/tax";
import {
  isBolsterLength,
  loadComposedSellable,
  type BolsterLength,
} from "@/lib/results/composed-sellable";
import {
  derivePackList,
  type BolsterPlacementRow,
  type PillowPlacementRow,
} from "@/lib/spatial-fillings";
import type { ShippingMethod } from "@/lib/types/ecommerce";
import type { SupabaseClient } from "@supabase/supabase-js";

type PrefLine = { item_id: number; quantity: number; category: string };
type AddonLine = { item_id: number; quantity: number };

export type AssignedBuildRow = {
  id: string;
  product_type: string | null;
  assigned_size: string | null;
  assigned_tier: string | null;
  assigned_length: string | null;
  filling_template_id: number | null;
  preference_lines: unknown;
  addon_lines: unknown;
  shipping_method: string | null;
  shipping_address: unknown;
  currency: string | null;
};

export type AssignedBuildOk = {
  ok: true;
  lines: BuildLine[];
  cogs: number;
  pricing: PriceResultOutput;
  /** Composed sellable MSRP for the assigned size×tier / length — the pillow/bolster
   * BASE price (excludes preference + add-on MSRPs). Commission base (#77). */
  basePrice: number;
  shortages: ReturnType<typeof findStockShortages>;
  nameByItem: Map<number, string>;
  /** Spatial Result snapshot rows (empty when the Result predates the spatial model).
   * Pillow cell rows or bolster slot rows, per product type. */
  fillingPlacements: Array<PillowPlacementRow | BolsterPlacementRow>;
};

export type AssignedBuildErr = { ok: false; error: string };

function itemLabel(name: string, subtype: string | null | undefined): string {
  return subtype ? `${name} (${subtype})` : name;
}

export async function loadAssignedBuild(
  admin: SupabaseClient,
  row: AssignedBuildRow,
  opts?: {
    /**
     * Price a mix that is not (yet) the stored snapshot. Staff re-configuration
     * quotes the build it is about to write, so a price Costings refuses leaves
     * the Result untouched instead of half-saved.
     */
    fillingPlacements?: Array<PillowPlacementRow | BolsterPlacementRow>;
  },
): Promise<AssignedBuildOk | AssignedBuildErr> {
  const productType = (row.product_type as "pillow" | "bolster" | null) ?? "pillow";

  // Fillings: the Result's spatial snapshot is the truth when present (ADR 0008);
  // the assigned template's flat lines are the legacy fallback. Bolster snapshots
  // live in their own table (own schema — slot rows only).
  const isBolster = productType === "bolster";
  let fillingPlacements: Array<PillowPlacementRow | BolsterPlacementRow>;
  if (opts?.fillingPlacements) {
    fillingPlacements = opts.fillingPlacements;
  } else {
    const { data: snapRows, error: snapErr } = await admin
      .from(isBolster ? "result_bolster_filling_placements" : "result_filling_placements")
      .select(isBolster ? "slot, item_id" : "section, sub_section, slot, item_id, row_index")
      .eq("result_id", row.id)
      .order("slot");
    if (snapErr) return { ok: false, error: snapErr.message };
    fillingPlacements = (snapRows ?? []) as unknown as Array<
      PillowPlacementRow | BolsterPlacementRow
    >;
  }

  if (!row.filling_template_id && fillingPlacements.length === 0) {
    return { ok: false, error: "Result has no Filling Template" };
  }

  let composedKey:
    | { productType: "pillow"; size: string; tier: string }
    | { productType: "bolster"; length: BolsterLength };
  if (productType === "pillow") {
    if (!row.assigned_size || !row.assigned_tier) {
      return { ok: false, error: "Pillow Result missing assigned size/tier" };
    }
    composedKey = {
      productType: "pillow",
      size: row.assigned_size,
      tier: row.assigned_tier,
    };
  } else {
    if (!row.assigned_length || !isBolsterLength(row.assigned_length)) {
      return { ok: false, error: "Bolster Result missing assigned length" };
    }
    composedKey = { productType: "bolster", length: row.assigned_length };
  }

  const composed = await loadComposedSellable(admin, composedKey);
  if (!composed.ok) return composed;

  const preferenceLines = (row.preference_lines ?? []) as PrefLine[];
  const addonLines = (row.addon_lines ?? []) as AddonLine[];

  let tplLines: Array<{ item_id: number; quantity: number }> = [];
  if (fillingPlacements.length === 0 && row.filling_template_id) {
    const { data, error: linesErr } = await admin
      .from("bom_template_lines")
      .select("item_id, quantity")
      .eq("template_id", row.filling_template_id);
    if (linesErr) return { ok: false, error: linesErr.message };
    tplLines = (data ?? []) as Array<{ item_id: number; quantity: number }>;
  }

  const composedBomRaw = composed.sellable.bomLines;
  // Stock commit and COGS consume this flatten (snapshot rows win, template lines fall back).
  const fillPack = derivePackList(fillingPlacements, tplLines);
  const fillItemIds = fillPack.map((l) => l.item_id);
  const allItemIds = [
    ...new Set([
      ...composedBomRaw.map((l) => l.item_id),
      ...fillItemIds,
      ...preferenceLines.map((l) => l.item_id),
      ...addonLines.map((l) => l.item_id),
    ]),
  ];

  const [{ data: items }, { data: balances }, { data: itemPrices }] = await Promise.all([
    allItemIds.length
      ? admin.from("items").select("id, name, subtype, category, price_family").in("id", allItemIds)
      : Promise.resolve({
          data: [] as Array<{
            id: number;
            name: string;
            subtype: string | null;
            category: string;
          }>,
        }),
    allItemIds.length
      ? admin.from("inventory_balances").select("item_id, on_hand").in("item_id", allItemIds)
      : Promise.resolve({ data: [] as Array<{ item_id: number; on_hand: number }> }),
    allItemIds.length
      ? admin.from("item_prices").select("item_id, msrp, cost_price").in("item_id", allItemIds)
      : Promise.resolve({
          data: [] as Array<{ item_id: number; msrp: number | null; cost_price: number | null }>,
        }),
  ]);

  const itemById = new Map(
    (items ?? []).map((i) => [
      i.id as number,
      i as { id: number; name: string; subtype: string | null; category: string },
    ]),
  );
  const nameByItem = new Map(
    [...itemById.entries()].map(([id, i]) => [id, itemLabel(i.name, i.subtype)]),
  );
  const onHandByItem = new Map(
    (balances ?? []).map((b) => [b.item_id as number, Number(b.on_hand)]),
  );
  const costByItem = new Map<number, number>();
  const msrpByItem = new Map<number, number>();
  for (const p of itemPrices ?? []) {
    if (p.cost_price != null) costByItem.set(p.item_id, Number(p.cost_price));
    if (p.msrp != null) msrpByItem.set(p.item_id, Number(p.msrp));
  }

  const fillingTemplateLines = fillPack.map((l) => ({
    item_id: l.item_id,
    quantity: l.count,
    category: itemById.get(l.item_id)?.category ?? "unknown",
  }));

  const assembled = assembleBuild({
    composedBomLines: composedBomRaw,
    fillingTemplateLines,
    preferenceLines,
    addonLines,
    costByItem,
  });
  if (!assembled.ok) return assembled;

  const shortages = findStockShortages(assembled.lines, onHandByItem, nameByItem);

  // One pricing rule, shared with the hold quote, the status page and the preview:
  // the Costings row for the chosen case family, moved only by what differs from it.
  const familyByItem = new Map<number, string | null>(
    (items ?? []).map((i) => [
      i.id as number,
      (i as { price_family?: string | null }).price_family ?? null,
    ]),
  );
  const { chosenCover, chosenCase } = resolvePreferences(preferenceLines, msrpByItem, familyByItem);
  const goods = priceComposedBuild({
    msrpByFamily: composed.sellable.msrpByFamily,
    defaultCover: composed.sellable.defaultCover,
    defaultCase: composed.sellable.defaultCase,
    caseOptions: composed.sellable.caseOptions,
    chosenCover,
    chosenCase,
    addonLines: [
      ...addonLines.map((l) => ({
        msrp: msrpByItem.get(l.item_id) ?? null,
        quantity: l.quantity,
      })),
      ...placedChargeLines(fillPack, itemById, msrpByItem),
    ],
  });
  if (!goods.ok) return { ok: false, error: goods.error };

  let shippingAmount = 0;
  let taxAmount = 0;
  const address = row.shipping_address as { country?: string } | null;
  if (row.shipping_method) {
    const { data: shippingRow } = await admin
      .from("shipping_methods")
      .select("*")
      .eq("slug", row.shipping_method)
      .maybeSingle();
    if (shippingRow) {
      shippingAmount = calculateShippingRate(shippingRow as ShippingMethod, goods.subtotal);
      const taxRule = await resolveTaxRuleForRegion(address?.country ?? "SG");
      taxAmount = computeTax(
        { subtotal: goods.subtotal, shippingAmount, discountAmount: 0 },
        taxRule,
      ).taxAmount;
    }
  }

  const pricing = priceResult({
    subtotal: goods.subtotal,
    shipping: shippingAmount,
    tax: taxAmount,
  });

  return {
    ok: true,
    lines: assembled.lines,
    cogs: assembled.cogs,
    pricing,
    basePrice: goods.base,
    shortages,
    nameByItem,
    fillingPlacements,
  };
}
