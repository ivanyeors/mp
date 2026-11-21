import type { SupabaseClient } from "@supabase/supabase-js";
import { priceResult } from "@/lib/result-pricing";
import { round2 } from "@/lib/commissions";
import { priceComposedBuild, resolvePreferences } from "@/lib/pricing/composed-price";
import {
  loadResultServiceLines,
  sumServiceLines,
  type ServiceLine,
} from "@/lib/pricing/service-lines";
import { computeTax, resolveTaxRuleForRegion } from "@/lib/ecommerce/tax";
import {
  isCaseInventoryCategory,
  isProtectorInventoryCategory,
  itemMatchesPreferenceRole,
} from "@/lib/shop/customization-inventory";
import { loadComposedSellable, type BolsterLength } from "@/lib/results/composed-sellable";

export type CompanionQuote =
  | { ok: true; total: number; currency: string; serviceLines: ServiceLine[] }
  | { ok: false; status: 400 | 409; error: string; pricingUnavailable?: boolean };

export async function priceCompanionBolster(
  admin: SupabaseClient,
  opts: {
    length: BolsterLength;
    preferenceLines: Array<{ item_id: number; quantity: number; category: "cover" | "case" }>;
    addonLines: ReadonlyArray<{ item_id: number; quantity: number }>;
    measuredByType: "by_user" | "staff";
    country: string;
  },
): Promise<CompanionQuote> {
  const composed = await loadComposedSellable(admin, { productType: "bolster", length: opts.length });
  if (!composed.ok) {
    if (composed.code) {
      console.error(`[results/hold] paired Mbolster pricing not usable (${composed.code}): ${composed.error}`);
      return { ok: false, status: 409, error: composed.error, pricingUnavailable: true };
    }
    return { ok: false, status: 400, error: composed.error };
  }

  const itemIds = [
    ...new Set([...opts.preferenceLines, ...opts.addonLines].map((l) => l.item_id)),
  ];
  const [{ data: items }, { data: prices }] = await Promise.all([
    itemIds.length
      ? admin.from("items").select("id, category, name, price_family").in("id", itemIds)
      : Promise.resolve({ data: [] as Array<{ id: number; category: string; name: string }> }),
    itemIds.length
      ? admin.from("item_prices").select("item_id, msrp").in("item_id", itemIds)
      : Promise.resolve({ data: [] as Array<{ item_id: number; msrp: number | null }> }),
  ]);

  const itemById = new Map((items ?? []).map((i) => [i.id as number, i]));
  for (const line of opts.preferenceLines) {
    const item = itemById.get(line.item_id);
    if (!item || !itemMatchesPreferenceRole(String(item.category), line.category)) {
      return { ok: false, status: 400, error: `Invalid Mbolster preference item ${line.item_id}` };
    }
  }
  for (const line of opts.addonLines) {
    const cat = String(itemById.get(line.item_id)?.category ?? "");
    if (!itemById.has(line.item_id) || cat === "filling" || isProtectorInventoryCategory(cat) || isCaseInventoryCategory(cat)) {
      return { ok: false, status: 400, error: `Invalid Mbolster add-on item ${line.item_id}` };
    }
  }

  const msrpByItem = new Map<number, number>();
  for (const p of prices ?? []) {
    if (p.msrp != null) msrpByItem.set(p.item_id, Number(p.msrp));
  }
  const familyByItem = new Map<number, string | null>(
    (items ?? []).map((i) => [
      i.id as number,
      (i as { price_family?: string | null }).price_family ?? null,
    ]),
  );
  const { chosenCover, chosenCase } = resolvePreferences(opts.preferenceLines, msrpByItem, familyByItem);
  const goods = priceComposedBuild({
    msrpByFamily: composed.sellable.msrpByFamily,
    defaultCover: composed.sellable.defaultCover,
    defaultCase: composed.sellable.defaultCase,
    caseOptions: composed.sellable.caseOptions,
    chosenCover,
    chosenCase,
    addonLines: opts.addonLines.map((l) => ({
      msrp: msrpByItem.get(l.item_id) ?? null,
      quantity: l.quantity,
    })),
  });
  if (!goods.ok) {
    console.error(`[results/hold] paired Mbolster pricing not usable (${goods.code}): ${goods.error}`);
    return { ok: false, status: 409, error: goods.error, pricingUnavailable: true };
  }

  let serviceLines: ServiceLine[];
  try {
    serviceLines = await loadResultServiceLines(admin, {
      measured_by_type: opts.measuredByType,
      product_type: "bolster",
      suggested_tier: null,
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`[results/hold] paired Mbolster service fees not usable: ${error}`);
    return { ok: false, status: 409, error, pricingUnavailable: true };
  }
  const services = sumServiceLines(serviceLines);

  const taxRule = await resolveTaxRuleForRegion(opts.country);
  const tax = computeTax({ subtotal: goods.subtotal + services, shippingAmount: 0, discountAmount: 0 }, taxRule);
  const priced = priceResult({ goods: goods.subtotal, services, shipping: 0, tax: tax.taxAmount });

  return {
    ok: true,
    total: round2(priced.total),
    currency: composed.sellable.currency,
    serviceLines,
  };
}
