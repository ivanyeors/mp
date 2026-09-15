/**
 * Server-side quote for a shop customization: loads Costings and runs the pure
 * `priceCustomizedBuild`. Kept apart from `customization-price.ts`, which must stay
 * client-safe for the preview.
 */

import { loadComposedSellable, type ComposedSellableKey } from "@/lib/results/composed-sellable";
import { customizationDelta, priceCustomizedBuild } from "@/lib/shop/customization-price";
import { toComponentRole } from "@/lib/shop/customization-inventory";
import { MAX_PIECES_PER_CELL, SECTIONS, SUB_SECTIONS } from "@/lib/spatial-fillings/core";
import type { supabaseAdmin } from "@/lib/supabase/server";
import type { ConfigLine, FillingLine } from "@/lib/types/customization";

// ponytail: the x-ray's physical ceiling (9 cells x 25 pieces). Fillings are inside
// the Costings row, so this and stock are the only bounds; a per-size cap would need
// its own Costings rule.
const MAX_FILLING_PIECES = SECTIONS.length * SUB_SECTIONS.length * MAX_PIECES_PER_CELL;

type ItemRow = {
  id: number;
  category: string;
  subtype: string | null;
  name: string;
  size: string | null;
  is_active: boolean | null;
};

/**
 * The Costings price of a customized build, the signed delta from the shelf price its
 * storefront variant carries, and the build's lines as the database knows them.
 *
 * Both apply handlers and checkout go through here so none of them can grow its own
 * arithmetic again. Everything the browser sent beyond `item_id` and `quantity` is
 * discarded: a line's pricing role comes from `items.category`, its name from
 * `items.name`, and `price_delta` is never read. A cover or case must be one this
 * size actually offers, anything else must already be in the BOM, and fillings must
 * be real fillings — otherwise a line priced as a cheap "cover" is built as whatever
 * the BOM ships.
 */
export async function quoteCustomization(
  admin: ReturnType<typeof supabaseAdmin>,
  key: ComposedSellableKey,
  lines: ConfigLine[],
  fillingLines: FillingLine[],
): Promise<
  | { ok: true; delta: number; subtotal: number; lines: ConfigLine[]; fillingLines: FillingLine[] }
  | { ok: false; error: string }
> {
  const composed = await loadComposedSellable(admin, key);
  if (!composed.ok) return { ok: false, error: composed.error };
  const sellable = composed.sellable;
  if (sellable.msrp == null) {
    return {
      ok: false,
      error: sellable.priceFault?.error ?? "This build has no Costings price",
    };
  }

  const ids = [...new Set([...lines, ...fillingLines].map((l) => Number(l.item_id)))];
  const [{ data: items }, { data: prices }] = ids.length
    ? await Promise.all([
        admin.from("items").select("id, category, subtype, name, size, is_active").in("id", ids),
        admin.from("item_prices").select("item_id, msrp").in("item_id", ids),
      ])
    : [{ data: [] as ItemRow[] }, { data: [] as Array<{ item_id: number; msrp: number | null }> }];
  const itemById = new Map<number, ItemRow>(
    ((items ?? []) as ItemRow[]).map((i) => [Number(i.id), i]),
  );
  // Seeded with null so an item with no `item_prices` row stays unpriced rather than
  // reading as absent-and-therefore-free.
  const msrpByItem = new Map<number, number | null>(ids.map((id) => [id, null]));
  for (const p of prices ?? []) {
    msrpByItem.set(Number(p.item_id), p.msrp == null ? null : Number(p.msrp));
  }

  const baseQuantityByItem = new Map(sellable.bomLines.map((l) => [l.item_id, l.quantity]));
  const offered = {
    cover: new Set([...sellable.coverOptions.map((c) => c.item_id), sellable.defaultCover?.item_id]),
    case: new Set([...sellable.caseOptions.map((c) => c.item_id), sellable.defaultCase?.item_id]),
  };
  const isOffered = (role: "cover" | "case", item: ItemRow) =>
    offered[role].has(item.id) ||
    // A bolster has no per-size case list: the configurator offers every active
    // bolster case, and `loadComposedSellable` leaves its options empty.
    (role === "case" && key.productType === "bolster" && item.category === "bolster_case" && !!item.is_active);

  const canonicalLines: ConfigLine[] = [];
  const seen = new Set<number>();
  const roleCount = { cover: 0, case: 0 };
  for (const line of lines) {
    const item = itemById.get(Number(line.item_id));
    const quantity = line.quantity;
    if (!item || seen.has(item.id) || !Number.isInteger(quantity) || quantity < 0) {
      return { ok: false, error: "This build has an unknown or repeated component" };
    }
    seen.add(item.id);
    const role = toComponentRole(item.category);
    if (role === "cover" || role === "case") {
      if (!isOffered(role, item) || quantity < 1 || ++roleCount[role] > 1) {
        return { ok: false, error: `This ${role} is not offered for this build` };
      }
    } else if (role === "filling" || !baseQuantityByItem.has(item.id)) {
      return { ok: false, error: `${item.name} is not part of this build` };
    }
    canonicalLines.push({
      item_id: item.id,
      category: role,
      subtype: item.subtype ?? undefined,
      name: item.name,
      size: item.size ?? undefined,
      quantity,
      is_addon: quantity > (baseQuantityByItem.get(item.id) ?? 0),
      price_delta: msrpByItem.get(item.id) ?? 0,
    });
  }

  const canonicalFillings: FillingLine[] = [];
  let pieces = 0;
  for (const line of fillingLines) {
    const item = itemById.get(Number(line.item_id));
    if (
      !item ||
      item.category !== "filling" ||
      !item.is_active ||
      !Number.isInteger(line.quantity) ||
      line.quantity < 1
    ) {
      return { ok: false, error: "Invalid items in filling lines — only fillings allowed" };
    }
    pieces += line.quantity;
    canonicalFillings.push({
      item_id: item.id,
      subtype: item.subtype ?? "",
      name: item.name,
      quantity: line.quantity,
    });
  }
  if (pieces > MAX_FILLING_PIECES) {
    return { ok: false, error: `A build holds at most ${MAX_FILLING_PIECES} filling pieces` };
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
    lines: canonicalLines,
    baseQuantityByItem,
    msrpByItem,
  });
  if (!result.ok) return { ok: false, error: result.error };

  const delta = customizationDelta(result, sellable.msrp);
  if (delta == null) return { ok: false, error: "This build has no Costings price" };
  return {
    ok: true,
    delta,
    subtotal: result.subtotal,
    lines: canonicalLines,
    fillingLines: canonicalFillings,
  };
}
