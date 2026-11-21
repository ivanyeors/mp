import { supabaseAdmin } from "@/lib/supabase/server";
import { syncProductToStripeSafe, type StripeSyncOutcome } from "@/lib/stripe/sync";
import {
  productName,
  thrownProblem,
  warningsFor,
  type NextStep,
  type PriceProblem,
  type StripeWarning,
} from "@/lib/shop/stripe-warnings";

export type PriceSyncResult = {
  productId: string;
  synced: number;
  unresolvable: string[];
  problems: PriceProblem[];
};

type VariantRow = {
  id: string;
  title: string | null;
  sku: string | null;
  pillow_product_id: number | null;
  item_id: number | null;
  option1: string | null;
  price_key: string | null;
};

export type PriceRow = { msrp: string | number | null; compare_at_price?: string | number | null };
type BomLine = { item_id: number; quantity: number };

export function resolveVariantPriceRow(
  variant: Pick<VariantRow, "price_key" | "pillow_product_id" | "option1" | "item_id">,
  priceByKey: Map<string, PriceRow>,
  priceByPillowProduct: Map<number, PriceRow>,
  priceByBolsterVariant: Map<string, PriceRow>,
  priceByItem: Map<number, PriceRow> = new Map(),
): PriceRow | null {
  const row =
    (variant.price_key ? priceByKey.get(variant.price_key) : null) ??
    (variant.pillow_product_id != null ? priceByPillowProduct.get(variant.pillow_product_id) : null) ??
    (variant.option1 ? priceByBolsterVariant.get(variant.option1) : null) ??
    (variant.item_id != null ? priceByItem.get(variant.item_id) : null);

  if (!row?.msrp) return null;
  return row;
}

export function resolveVariantPrice(
  variant: Pick<VariantRow, "price_key" | "pillow_product_id" | "option1" | "item_id">,
  priceByKey: Map<string, PriceRow>,
  priceByPillowProduct: Map<number, PriceRow>,
  priceByBolsterVariant: Map<string, PriceRow>,
  priceByItem: Map<number, PriceRow> = new Map(),
): number | null {
  const row = resolveVariantPriceRow(variant, priceByKey, priceByPillowProduct, priceByBolsterVariant, priceByItem);
  if (!row?.msrp) return null;
  const v = parseFloat(String(row.msrp));
  return Number.isFinite(v) ? v : null;
}

export function resolveVariantCompareAt(
  variant: Pick<VariantRow, "price_key" | "pillow_product_id" | "option1" | "item_id">,
  priceByKey: Map<string, PriceRow>,
  priceByPillowProduct: Map<number, PriceRow>,
  priceByBolsterVariant: Map<string, PriceRow>,
  priceByItem: Map<number, PriceRow> = new Map(),
): number | null {
  const row = resolveVariantPriceRow(variant, priceByKey, priceByPillowProduct, priceByBolsterVariant, priceByItem);
  if (!row?.compare_at_price) return null;
  const v = parseFloat(String(row.compare_at_price));
  return Number.isFinite(v) ? v : null;
}

export function resolveVariantCost(
  variant: Pick<VariantRow, "item_id" | "pillow_product_id" | "option1">,
  bomByPillow: Map<number, BomLine[]>,
  bomByBolster: Map<string, BomLine[]>,
  costByItem: Map<number, number>,
): number | null {
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

export async function loadCostingsPriceMaps(admin: ReturnType<typeof supabaseAdmin>) {
  const [
    { data: productPrices, error: productPricesErr },
    { data: bomLines, error: bomErr },
    { data: bolsterLines, error: bolsterErr },
    { data: itemPrices, error: itemPricesErr },
    { data: caseItems, error: caseItemsErr },
  ] = await Promise.all([
    admin.from("product_prices").select("key, kind, product_id, variant, msrp, compare_at_price"),
    admin.from("bom_lines").select("product_id, item_id, quantity"),
    admin.from("bolster_bom_lines").select("variant, item_id, quantity"),
    admin.from("item_prices").select("item_id, cost_price, msrp, compare_at_price"),
    admin.from("items").select("id, price_family").not("price_family", "is", null),
  ]);

  const failedReads = (
    [
      ["product_prices", productPricesErr],
      ["bom_lines", bomErr],
      ["bolster_bom_lines", bolsterErr],
      ["item_prices", itemPricesErr],
      ["items", caseItemsErr],
    ] as const
  ).flatMap(([table, err]) => (err ? [`${table} (${err.message})`] : []));

  const familyByItem = new Map<number, string>(
    (caseItems ?? []).map((i) => [Number(i.id), String(i.price_family)]),
  );
  const defaultFamilyByPillow = new Map<number, string>();
  for (const b of [...(bomLines ?? [])].sort((x, y) => Number(x.item_id) - Number(y.item_id))) {
    const family = familyByItem.get(Number(b.item_id));
    if (family && !defaultFamilyByPillow.has(Number(b.product_id))) {
      defaultFamilyByPillow.set(Number(b.product_id), family);
    }
  }

  const priceByKey = new Map<string, PriceRow>();
  const priceByPillowProduct = new Map<number, PriceRow>();
  const priceByBolsterVariant = new Map<string, PriceRow>();
  for (const p of productPrices ?? []) {
    const row: PriceRow = { msrp: p.msrp, compare_at_price: p.compare_at_price };
    const isNonDefaultPillowFamily =
      p.kind === "pillow" &&
      p.product_id != null &&
      p.variant != null &&
      p.variant !== (defaultFamilyByPillow.get(Number(p.product_id)) ?? null);

    if (!isNonDefaultPillowFamily) priceByKey.set(p.key, row);

    if (p.kind === "pillow" && p.product_id != null) {
      if (!isNonDefaultPillowFamily) priceByPillowProduct.set(p.product_id, row);
    }
    if (p.kind === "bolster" && p.variant) priceByBolsterVariant.set(p.variant, row);
  }

  const priceByItem = new Map<number, PriceRow>();
  for (const ip of itemPrices ?? []) {
    const row: PriceRow = { msrp: ip.msrp, compare_at_price: ip.compare_at_price };
    priceByItem.set(ip.item_id, row);
    priceByKey.set(`item:${ip.item_id}`, row);
  }

  return {
    priceByKey,
    priceByPillowProduct,
    priceByBolsterVariant,
    priceByItem,
    bomLines: bomLines ?? [],
    bolsterLines: bolsterLines ?? [],
    itemPrices: itemPrices ?? [],
    failedReads,
  };
}

const RESYNC: NextStep = { kind: "resync-prices" };

export function stripeSyncProblems(stripe: StripeSyncOutcome): PriceProblem[] {
  const notices: PriceProblem[] = stripe.notices.map((message) => ({ message }));
  if (stripe.synced) return notices;
  if (stripe.pricesInPlace) {
    return [...notices, { message: stripe.error ?? "The new prices are in place, but Stripe needs attention." }];
  }
  return [
    ...notices,
    {
      message: `Couldn't sync to Stripe, so customers may still be charged the old price: ${stripe.error ?? "unknown error"}`,
      next: { kind: "sync-to-stripe" },
    },
  ];
}

// ponytail: loads full BOM + item_prices tables (small, < 500 rows). Upgrade path: filter by
// relevant item IDs if tables grow large.
export async function syncVariantPricesFromCostings(productId: string): Promise<PriceSyncResult> {
  const admin = supabaseAdmin();

  const { data: variants, error: vErr } = await admin
    .from("product_variants")
    .select("id, title, sku, pillow_product_id, item_id, option1, price_key")
    .eq("product_id", productId);

  if (vErr) {
    return {
      productId,
      synced: 0,
      unresolvable: [],
      problems: [{ message: `Couldn't read its variants, so no price was updated: ${vErr.message}`, next: RESYNC }],
    };
  }
  if (!variants?.length) return { productId, synced: 0, unresolvable: [], problems: [] };

  const maps = await loadCostingsPriceMaps(admin);
  if (maps.failedReads.length > 0) {
    return {
      productId,
      synced: 0,
      unresolvable: [],
      problems: [
        {
          message: `Couldn't read Costings (${maps.failedReads.join(", ")}), so no price was updated`,
          next: RESYNC,
        },
      ],
    };
  }
  const { priceByKey, priceByPillowProduct, priceByBolsterVariant, priceByItem } = maps;
  const bomLines = maps.bomLines;
  const bolsterLines = maps.bolsterLines;
  const itemPrices = maps.itemPrices;

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
  const problems: PriceProblem[] = [];

  for (const v of variants as VariantRow[]) {
    const price = resolveVariantPrice(v, priceByKey, priceByPillowProduct, priceByBolsterVariant, priceByItem);
    if (price === null) {
      unresolvable.push(v.id);
      continue;
    }
    const cost = resolveVariantCost(v, bomByPillow, bomByBolster, costByItem);
    const compareAt = resolveVariantCompareAt(v, priceByKey, priceByPillowProduct, priceByBolsterVariant, priceByItem);
    const update: Record<string, unknown> = {
      price,
      compare_at_price: compareAt,
    };
    if (cost !== null) update.cost_price = cost;

    const { error } = await admin.from("product_variants").update(update).eq("id", v.id);
    if (error) {
      problems.push({
        message: `Couldn't save the new price for ${v.title || v.sku || v.id}: ${error.message}`,
        next: RESYNC,
      });
    } else {
      synced++;
    }
  }

  if (synced > 0) {
    problems.push(...stripeSyncProblems(await syncProductToStripeSafe(productId)));
  }

  return { productId, synced, unresolvable, problems };
}

export async function repriceFromCostings(
  product: { id: string; name: string },
): Promise<StripeWarning[]> {
  try {
    const result = await syncVariantPricesFromCostings(product.id);
    return warningsFor(product.name, result.problems);
  } catch (err) {
    return warningsFor(product.name, [thrownProblem(err)]);
  }
}

// ponytail: syncs all auto-generated products (typically 2–3); fine for this table size. Upgrade
// path: pass affected product_price keys and resolve affected products selectively.
export async function syncAllAutoGeneratedProductPrices(): Promise<{
  results: PriceSyncResult[];
  stripeWarnings: StripeWarning[];
}> {
  const admin = supabaseAdmin();
  const { data: products, error } = await admin
    .from("products")
    .select("id, slug, content")
    .eq("is_auto_generated", true);
  if (error) {
    return {
      results: [],
      stripeWarnings: warningsFor(undefined, [
        {
          message: `Couldn't read the shop products, so no price was updated from Costings: ${error.message}`,
          next: RESYNC,
        },
      ]),
    };
  }

  const rows = (products ?? []) as Array<{ id: string; slug: string; content: unknown }>;
  const results = await Promise.all(
    rows.map((p) =>
      syncVariantPricesFromCostings(p.id).catch(
        (err: unknown): PriceSyncResult => ({
          productId: p.id,
          synced: 0,
          unresolvable: [],
          problems: [thrownProblem(err)],
        }),
      ),
    ),
  );
  const stripeWarnings = results.flatMap((r, i) => warningsFor(productName(rows[i]!), r.problems));
  return { results, stripeWarnings };
}
