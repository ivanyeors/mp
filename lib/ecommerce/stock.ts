/**
 * Stock availability resolution rules.
 *
 * ponytail: this is the TS twin of the SQL `variant_stock` view (see
 * supabase/migrations/20260630120000_variant_stock_bolster.sql). The DB view is
 * the runtime authority for storefront loaders and checkout; this pure function
 * exists so the precedence is documented, testable, and reusable by code that
 * resolves availability without round-tripping to the view. Keep the two in sync:
 * if you change one CASE branch, change the other.
 */

/** Sentinel for untracked variants — effectively infinite availability. */
export const UNTRACKED_STOCK = 999_999;

export interface StockResolutionInput {
  track_inventory: boolean;
  /** Raw column fallback used only when no BOM/item link resolves. */
  stock_quantity: number;
  /** Linked pillow product id (resolves via pillow buildable). */
  pillow_product_id?: number | null;
  /** Linked inventory item id (resolves via item on-hand). */
  item_id?: number | null;
  /** True when the parent product is a bolster (resolves via bolster buildable). */
  is_bolster?: boolean;
}

export interface StockSources {
  /** product_buildable.buildable keyed by pillow_product_id. */
  pillowBuildable?: Map<number, number>;
  /** inventory_balances.on_hand keyed by item_id. */
  itemOnHand?: Map<number, number>;
  /** bolster_buildable.buildable keyed by the bolster variant key (e.g. "medium"). */
  bolsterBuildable?: Map<string, number>;
  /** The variant's option1, lowercased, used to look up bolster buildable. */
  bolsterVariantKey?: string | null;
}

/**
 * Resolve a single variant's available quantity, matching the precedence of the
 * `variant_stock` SQL view exactly:
 *   1. track_inventory = false  -> UNTRACKED_STOCK
 *   2. pillow_product_id set     -> pillow buildable (min across BOM)
 *   3. item_id set               -> item on-hand
 *   4. bolster product           -> bolster buildable (min across bolster BOM)
 *   5. otherwise                 -> raw stock_quantity
 */
export function resolveStockAvailable(
  variant: StockResolutionInput,
  sources: StockSources = {}
): number {
  if (variant.track_inventory === false) return UNTRACKED_STOCK;

  if (variant.pillow_product_id != null) {
    return sources.pillowBuildable?.get(variant.pillow_product_id) ?? 0;
  }

  if (variant.item_id != null) {
    return sources.itemOnHand?.get(variant.item_id) ?? 0;
  }

  if (variant.is_bolster) {
    const key = sources.bolsterVariantKey?.toLowerCase();
    return (key ? sources.bolsterBuildable?.get(key) : undefined) ?? 0;
  }

  return variant.stock_quantity;
}
