/** Load assembled build + stock + pricing for an assigned Result. */

import { assembleBuild, findStockShortages, type BuildLine } from "@/lib/build-assembly";
import { priceResult, type PriceResultOutput } from "@/lib/result-pricing";
import { calculateShippingRate } from "@/lib/ecommerce/shipping";
import { computeTax, resolveTaxRuleForRegion } from "@/lib/ecommerce/tax";
import type { ShippingMethod } from "@/lib/types/ecommerce";
import type { SupabaseClient } from "@supabase/supabase-js";

type PrefLine = { item_id: number; quantity: number; category: string };
type AddonLine = { item_id: number; quantity: number };

export type AssignedBuildRow = {
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
  shortages: ReturnType<typeof findStockShortages>;
  nameByItem: Map<number, string>;
};

export type AssignedBuildErr = { ok: false; error: string };

function itemLabel(name: string, subtype: string | null | undefined): string {
  return subtype ? `${name} (${subtype})` : name;
}

export async function loadAssignedBuild(
  admin: SupabaseClient,
  row: AssignedBuildRow,
): Promise<AssignedBuildOk | AssignedBuildErr> {
  const productType = (row.product_type as "pillow" | "bolster" | null) ?? "pillow";
  if (!row.filling_template_id) {
    return { ok: false, error: "Result has no Filling Template" };
  }

  let composedProductId: number | null = null;
  if (productType === "pillow") {
    if (!row.assigned_size || !row.assigned_tier) {
      return { ok: false, error: "Pillow Result missing assigned size/tier" };
    }
    const { data: pillowProduct } = await admin
      .from("pillow_products")
      .select("id")
      .eq("size", row.assigned_size)
      .eq("kind", row.assigned_tier)
      .eq("is_active", true)
      .maybeSingle();
    if (!pillowProduct) {
      return {
        ok: false,
        error: `No active composed sellable for size ${row.assigned_size} tier ${row.assigned_tier}`,
      };
    }
    composedProductId = pillowProduct.id;
  } else if (!row.assigned_length) {
    return { ok: false, error: "Bolster Result missing assigned length" };
  }

  const preferenceLines = (row.preference_lines ?? []) as PrefLine[];
  const addonLines = (row.addon_lines ?? []) as AddonLine[];

  const { data: tplLines, error: linesErr } = await admin
    .from("bom_template_lines")
    .select("item_id, quantity")
    .eq("template_id", row.filling_template_id);
  if (linesErr) return { ok: false, error: linesErr.message };

  let composedBomRaw: Array<{ item_id: number; quantity: number; category: string }> = [];
  if (composedProductId != null) {
    const { data: bomLines, error: bomErr } = await admin
      .from("bom_lines")
      .select("item_id, quantity, items!inner(category)")
      .eq("product_id", composedProductId);
    if (bomErr) return { ok: false, error: bomErr.message };
    composedBomRaw = (bomLines ?? []).map((l) => {
      const items = l.items as unknown as { category: string } | { category: string }[];
      const category = Array.isArray(items) ? items[0]?.category : items?.category;
      return {
        item_id: l.item_id as number,
        quantity: Number(l.quantity),
        category: String(category ?? "unknown"),
      };
    });
  }

  const fillItemIds = (tplLines ?? []).map((l) => l.item_id as number);
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
      ? admin.from("items").select("id, name, subtype, category").in("id", allItemIds)
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
      ? admin.from("item_prices").select("item_id, msrp, cost").in("item_id", allItemIds)
      : Promise.resolve({
          data: [] as Array<{ item_id: number; msrp: number | null; cost: number | null }>,
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
    if (p.cost != null) costByItem.set(p.item_id, Number(p.cost));
    if (p.msrp != null) msrpByItem.set(p.item_id, Number(p.msrp));
  }

  const fillingTemplateLines = (tplLines ?? []).map((l) => ({
    item_id: l.item_id as number,
    quantity: Number(l.quantity),
    category: itemById.get(l.item_id as number)?.category ?? "unknown",
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

  if (productType !== "pillow" || composedProductId == null) {
    return {
      ok: false,
      error: "Bolster accept pricing is not available yet (slice 09)",
    };
  }

  const { data: productPrice } = await admin
    .from("product_prices")
    .select("msrp, currency")
    .eq("kind", "pillow")
    .eq("product_id", composedProductId)
    .maybeSingle();
  const composedMsrp = productPrice?.msrp != null ? Number(productPrice.msrp) : null;
  if (composedMsrp == null) {
    return { ok: false, error: "Composed sellable has no Costings MSRP" };
  }

  const preferencePriced = preferenceLines.map((l) => ({
    msrp: msrpByItem.get(l.item_id) ?? 0,
    quantity: l.quantity,
  }));
  const addonPriced = addonLines.map((l) => ({
    msrp: msrpByItem.get(l.item_id) ?? 0,
    quantity: l.quantity,
  }));

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
      const prefSubtotal =
        preferencePriced.reduce((s, l) => s + l.msrp * l.quantity, 0) +
        addonPriced.reduce((s, l) => s + l.msrp * l.quantity, 0);
      shippingAmount = calculateShippingRate(
        shippingRow as ShippingMethod,
        composedMsrp + prefSubtotal,
      );
      const taxRule = await resolveTaxRuleForRegion(address?.country ?? "SG");
      taxAmount = computeTax(
        {
          subtotal: composedMsrp + prefSubtotal,
          shippingAmount,
          discountAmount: 0,
        },
        taxRule,
      ).taxAmount;
    }
  }

  const pricing = priceResult({
    composedSellableMsrp: composedMsrp,
    preferenceLines: preferencePriced,
    addonLines: addonPriced,
    shipping: shippingAmount,
    tax: taxAmount,
  });

  return {
    ok: true,
    lines: assembled.lines,
    cogs: assembled.cogs,
    pricing,
    shortages,
    nameByItem,
  };
}
