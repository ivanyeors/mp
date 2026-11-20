// ponytail: this is the TS twin of the SQL `variant_stock` view
// (supabase/migrations/20260630120000_variant_stock_bolster.sql), the runtime authority for
// storefront loaders and checkout. Keep the two in sync: if you change one CASE branch, change the
// other.

export const UNTRACKED_STOCK = 999_999;

export interface StockResolutionInput {
  track_inventory: boolean;
  stock_quantity: number;
  pillow_product_id?: number | null;
  item_id?: number | null;
  is_bolster?: boolean;
}

export interface StockSources {
  pillowBuildable?: Map<number, number>;
  itemOnHand?: Map<number, number>;
  bolsterBuildable?: Map<string, number>;
  bolsterVariantKey?: string | null;
}

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
