import { supabaseAdmin } from "@/lib/supabase/server";
import { syncProductToStripeSafe } from "@/lib/stripe/sync";

export type PriceSyncResult = {
  synced: number;
  unresolvable: string[]; // variant IDs with no resolvable costing source
  stripeSync: boolean;
};

type VariantRow = {
  id: string;
  pillow_product_id: number | null;
  item_id: number | null;
  option1: string | null;
  price_key: string | null;
};

type PriceRow = { msrp: string | number | null };
type BomLine = { item_id: number; quantity: number };

// ── Pure resolution functions (testable without DB) ────────────────────────

/**
 * Resolve MSRP for a variant. Resolution order:
 *   1. price_key   → direct product_prices.key lookup (explicit override)
 *   2. pillow_product_id → product_prices WHERE kind='pillow'
 *   3. option1 in ('short','medium','long') → product_prices WHERE kind='bolster'
 */
export function resolveVariantPrice(
  variant: Pick<VariantRow, "price_key" | "pillow_product_id" | "option1">,
  priceByKey: Map<string, PriceRow>,
  priceByPillowProduct: Map<number, PriceRow>,
  priceByBolsterVariant: Map<string, PriceRow>,
): number | null {
  const row =
    (variant.price_key ? priceByKey.get(variant.price_key) : null) ??
    (variant.pillow_product_id != null ? priceByPillowProduct.get(variant.pillow_product_id) : null) ??
    (variant.option1 ? priceByBolsterVariant.get(variant.option1) : null);

  if (!row?.msrp) return null;
  const v = parseFloat(String(row.msrp));
  return Number.isFinite(v) ? v : null;
}

/**
 * Resolve BOM cost for a variant. Resolution order:
 *   1. item_id (direct item link, e.g. accessories) → item_prices.cost_price
 *   2. pillow_product_id → bom_lines → sum(cost_price * quantity)
 *   3. option1 for bolster → bolster_bom_lines → sum(cost_price * quantity)
 * Returns null if any BOM component is missing a cost.
 */
export function resolveVariantCost(
  variant: Pick<VariantRow, "item_id" | "pillow_product_id" | "option1">,
  bomByPillow: Map<number, BomLine[]>,
  bomByBolster: Map<string, BomLine[]>,
  costByItem: Map<number, number>,
): number | null {
  // Direct item link (accessories / single-item)
  if (variant.item_id != null && variant.pillow_product_id == null) {
    const cost = costByItem.get(variant.item_id);
    return cost ?? null;
  }

  const components =
    (variant.pillow_product_id != null ? bomByPillow.get(variant.pillow_product_id) : null) ??
    (variant.option1 ? bomByBolster.get(variant.option1) : null) ??
    [];

  if (!components.length) return null;
  let total = 0;
  for (const c of components) {
    const cost = costByItem.get(c.item_id);
    if (cost == null) return null;
    total += cost * c.quantity;
  }
  return total;
}

// ── DB-backed sync ─────────────────────────────────────────────────────────

/**
 * Resolve MSRP + BOM cost from costings tables for all variants of a product,
 * write price / cost_price, then push to Stripe.
 *
 * ponytail: loads full BOM + item_prices tables (small, < 500 rows).
 * Upgrade path: filter by relevant item IDs if tables grow large.
 */
export async function syncVariantPricesFromCostings(productId: string): Promise<PriceSyncResult> {
  const admin = supabaseAdmin();

  const { data: variants, error: vErr } = await admin
    .from("product_variants")
    .select("id, pillow_product_id, item_id, option1, price_key")
    .eq("product_id", productId);

  if (vErr || !variants?.length) return { synced: 0, unresolvable: [], stripeSync: false };

  const [
    { data: productPrices },
    { data: bomLines },
    { data: bolsterLines },
    { data: itemPrices },
  ] = await Promise.all([
    admin.from("product_prices").select("key, kind, product_id, variant, msrp"),
    admin.from("bom_lines").select("product_id, item_id, quantity"),
    admin.from("bolster_bom_lines").select("variant, item_id, quantity"),
    admin.from("item_prices").select("item_id, cost_price"),
  ]);

  const priceByKey = new Map<string, PriceRow>();
  const priceByPillowProduct = new Map<number, PriceRow>();
  const priceByBolsterVariant = new Map<string, PriceRow>();
  for (const p of productPrices ?? []) {
    priceByKey.set(p.key, p);
    if (p.kind === "pillow" && p.product_id != null) priceByPillowProduct.set(p.product_id, p);
    if (p.kind === "bolster" && p.variant) priceByBolsterVariant.set(p.variant, p);
  }

  const bomByPillow = new Map<number, BomLine[]>();
  for (const b of bomLines ?? []) {
    const list = bomByPillow.get(b.product_id) ?? [];
    list.push({ item_id: Number(b.item_id), quantity: Number(b.quantity) });
    bomByPillow.set(b.product_id, list);
  }

  const bomByBolster = new Map<string, BomLine[]>();
  for (const b of bolsterLines ?? []) {
    const list = bomByBolster.get(b.variant) ?? [];
    list.push({ item_id: Number(b.item_id), quantity: Number(b.quantity) });
    bomByBolster.set(b.variant, list);
  }

  const costByItem = new Map<number, number>();
  for (const ip of itemPrices ?? []) {
    if (ip.cost_price != null) costByItem.set(ip.item_id, parseFloat(String(ip.cost_price)));
  }

  let synced = 0;
  const unresolvable: string[] = [];

  for (const v of variants as VariantRow[]) {
    const price = resolveVariantPrice(v, priceByKey, priceByPillowProduct, priceByBolsterVariant);
    if (price === null) {
      unresolvable.push(v.id);
      continue;
    }
    const cost = resolveVariantCost(v, bomByPillow, bomByBolster, costByItem);
    const update: Record<string, unknown> = { price };
    if (cost !== null) update.cost_price = cost;

    const { error } = await admin.from("product_variants").update(update).eq("id", v.id);
    if (!error) synced++;
  }

  let stripeSync = false;
  if (synced > 0) {
    const result = await syncProductToStripeSafe(productId);
    stripeSync = result.synced;
  }

  return { synced, unresolvable, stripeSync };
}

/**
 * Sync all auto-generated products. Called from costings save so any MSRP
 * edit propagates to storefront prices immediately.
 *
 * ponytail: syncs all auto-generated products (typically 2–3); fine for this
 * table size. Upgrade path: pass affected product_price keys and resolve
 * affected products selectively.
 */
export async function syncAllAutoGeneratedProductPrices(): Promise<PriceSyncResult[]> {
  const admin = supabaseAdmin();
  const { data: products } = await admin
    .from("products")
    .select("id")
    .eq("is_auto_generated", true);

  return Promise.all((products ?? []).map((p: { id: string }) => syncVariantPricesFromCostings(p.id)));
}
