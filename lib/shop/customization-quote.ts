/**
 * Server-side quote for a shop customization: loads Costings and runs the pure
 * `priceCustomizedBuild`. Kept apart from `customization-price.ts`, which must stay
 * client-safe for the preview.
 */

import { loadComposedSellable, type ComposedSellableKey } from "@/lib/results/composed-sellable";
import { customizationDelta, priceCustomizedBuild } from "@/lib/shop/customization-price";
import type { supabaseAdmin } from "@/lib/supabase/server";
import type { ConfigLine } from "@/lib/types/customization";

/**
 * The Costings price of a customized build, and the signed delta from the shelf
 * price its storefront variant carries.
 *
 * Both apply handlers and checkout go through here so none of them can grow its own
 * arithmetic again. The client's `component_quantities[].price_delta` is ignored: it
 * is browser input on a money path.
 */
export async function quoteCustomization(
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
