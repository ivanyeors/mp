import { supabaseAdmin } from "@/lib/supabase/server";
import { syncVariantPricesFromCostings } from "@/lib/shop/price-sync";

export type SellableItem = {
  id: number;
  name: string;
  category: string;
  subtype: string | null;
  size: string | null;
  msrp: number;
  compare_at_price: number | null;
};

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function itemDisplayName(item: { name: string; subtype: string | null; size: string | null; category: string }): string {
  const parts = [item.name];
  if (item.subtype) parts.push(item.subtype);
  if (item.size) parts.push(item.size);
  return parts.filter(Boolean).join(" ") || item.category;
}

function parseMoney(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const v = parseFloat(String(value));
  return Number.isFinite(v) ? v : null;
}

/**
 * Items with an MSRP that are not yet published as a storefront product.
 * Sellability signal: item_prices.msrp is not null.
 */
export async function listUnpublishedSellableItems(): Promise<SellableItem[]> {
  const admin = supabaseAdmin();

  const [{ data: items }, { data: prices }, { data: published }] = await Promise.all([
    admin.from("items").select("id, name, category, subtype, size").eq("is_active", true),
    admin.from("item_prices").select("item_id, msrp, compare_at_price").not("msrp", "is", null),
    admin.from("product_variants").select("item_id").not("item_id", "is", null),
  ]);

  const publishedIds = new Set((published ?? []).map((v: { item_id: number }) => v.item_id));
  const priceByItem = new Map(
    (prices ?? []).map((p: { item_id: number; msrp: string | number; compare_at_price: string | number | null }) => [
      p.item_id,
      p,
    ]),
  );

  const result: SellableItem[] = [];
  for (const item of items ?? []) {
    if (publishedIds.has(item.id)) continue;
    const price = priceByItem.get(item.id);
    if (!price) continue;
    const msrp = parseMoney(price.msrp);
    if (msrp == null) continue;
    result.push({
      id: item.id,
      name: itemDisplayName(item),
      category: item.category,
      subtype: item.subtype,
      size: item.size,
      msrp,
      compare_at_price: parseMoney(price.compare_at_price),
    });
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

export type FromInventoryResult =
  | { ok: true; productId: string; variantId: string }
  | { ok: false; error: string; status: number };

/**
 * Create one auto-generated product + single item-linked variant from a sellable inventory item.
 * Price/cost/compare-at are populated by price-sync from Costings.
 */
export async function createProductFromInventoryItem(itemId: number): Promise<FromInventoryResult> {
  const admin = supabaseAdmin();

  const { data: item } = await admin
    .from("items")
    .select("id, name, category, subtype, size, is_active")
    .eq("id", itemId)
    .single();

  if (!item || !item.is_active) {
    return { ok: false, error: "Item not found or inactive", status: 404 };
  }

  const { data: price } = await admin
    .from("item_prices")
    .select("msrp")
    .eq("item_id", itemId)
    .maybeSingle();

  if (!price?.msrp) {
    return { ok: false, error: "Item has no MSRP in Costings — set MSRP before publishing", status: 400 };
  }

  const { data: existingVariant } = await admin
    .from("product_variants")
    .select("id, product_id")
    .eq("item_id", itemId)
    .maybeSingle();

  if (existingVariant) {
    return { ok: false, error: "Item is already published as a product", status: 409 };
  }

  const title = itemDisplayName(item);
  let slug = slugify(title) || `item-${itemId}`;

  // Ensure unique slug.
  const { data: slugClash } = await admin.from("products").select("id").eq("slug", slug).maybeSingle();
  if (slugClash) slug = `${slug}-${itemId}`;

  const { data: category } = await admin
    .from("categories")
    .select("id")
    .eq("slug", "accessories")
    .maybeSingle();

  const { data: product, error: productErr } = await admin
    .from("products")
    .insert({
      slug,
      product_type: "accessory",
      status: "draft",
      is_auto_generated: true,
      category_id: category?.id ?? null,
      tags: [item.category, "inventory"],
      content: {
        "en-US": {
          title,
          description: "",
          body: "",
          seo_title: title,
          seo_description: "",
        },
        "zh-CN": {
          title,
          description: "",
          body: "",
          seo_title: title,
          seo_description: "",
        },
      },
    })
    .select("id")
    .single();

  if (productErr || !product) {
    return { ok: false, error: productErr?.message ?? "Failed to create product", status: 500 };
  }

  const { data: variant, error: variantErr } = await admin
    .from("product_variants")
    .insert({
      product_id: product.id,
      item_id: itemId,
      price_key: `item:${itemId}`,
      title,
      sku: `ITEM-${itemId}`,
      price: 0,
      currency: "SGD",
      track_inventory: true,
      is_active: true,
      position: 0,
    })
    .select("id")
    .single();

  if (variantErr || !variant) {
    // Roll back the product shell so we don't leave an empty listing.
    await admin.from("products").delete().eq("id", product.id);
    return { ok: false, error: variantErr?.message ?? "Failed to create variant", status: 500 };
  }

  await syncVariantPricesFromCostings(product.id).catch(() => {});

  return { ok: true, productId: product.id, variantId: variant.id };
}
