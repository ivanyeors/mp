import { supabaseAdmin } from "@/lib/supabase/server";
import { syncVariantPricesFromCostings } from "@/lib/shop/price-sync";


function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseMoney(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const v = parseFloat(String(value));
  return Number.isFinite(v) ? v : null;
}

const SIZE_ORDER = ["XS", "S", "M", "L", "XL"] as const;

/** ponytail: pillow size order for accessory families; extend SIZE_ORDER if new sizes appear */
export function sizeSortKey(size: string | null): number {
  if (!size) return 999;
  const i = (SIZE_ORDER as readonly string[]).indexOf(size.toUpperCase());
  return i === -1 ? 500 : i;
}

export type AccessoryFamilyItem = {
  id: number;
  name: string;
  size: string | null;
  category: string;
};

export type PublishFamilyResult =
  | { ok: true; productId: string; slug: string; variantIds: string[] }
  | { ok: false; error: string; status: number };

/**
 * One storefront product for a same-name accessory family (e.g. Cervical XS/S/M/L → one PDP).
 * Status active so the listing is immediately shoppable; tweak copy/images in Settings later.
 *
 * `title` overrides the shopper-facing name. Inventory names a cover "Camel";
 * the shop needs "Camel Bolster Case". The slug still follows the title.
 */
export async function publishAccessoryFamily(
  items: AccessoryFamilyItem[],
  title?: string,
): Promise<PublishFamilyResult> {
  if (items.length === 0) {
    return { ok: false, error: "No items to publish", status: 400 };
  }

  const baseName = title ?? items[0]!.name;
  if (items.some((i) => i.name !== items[0]!.name)) {
    return { ok: false, error: "Family items must share the same name", status: 400 };
  }

  const admin = supabaseAdmin();
  const ids = items.map((i) => i.id);

  const { data: existing } = await admin
    .from("product_variants")
    .select("item_id")
    .in("item_id", ids);

  if (existing && existing.length > 0) {
    return {
      ok: false,
      error: `Already published: item_id ${existing.map((e: { item_id: number }) => e.item_id).join(", ")}`,
      status: 409,
    };
  }

  const sorted = [...items].sort((a, b) => sizeSortKey(a.size) - sizeSortKey(b.size));
  const hasSizes = sorted.some((i) => i.size);
  let slug = slugify(baseName) || `item-${sorted[0]!.id}`;

  const { data: slugClash } = await admin.from("products").select("id").eq("slug", slug).maybeSingle();
  if (slugClash) slug = `${slug}-${sorted[0]!.id}`;

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
      status: "active",
      is_auto_generated: true,
      category_id: category?.id ?? null,
      tags: [sorted[0]!.category, "inventory"],
      content: {
        "en-US": {
          title: baseName,
          description: "",
          body: "",
          seo_title: baseName,
          seo_description: "",
        },
        "zh-CN": {
          title: baseName,
          description: "",
          body: "",
          seo_title: baseName,
          seo_description: "",
        },
      },
    })
    .select("id")
    .single();

  if (productErr || !product) {
    return { ok: false, error: productErr?.message ?? "Failed to create product", status: 500 };
  }

  if (hasSizes) {
    const sizeValues = sorted.map((i) => i.size!).filter(Boolean);
    const { error: optErr } = await admin.from("product_options").insert({
      product_id: product.id,
      name: "Size",
      position: 1,
      values: sizeValues,
    });
    if (optErr) {
      await admin.from("products").delete().eq("id", product.id);
      return { ok: false, error: optErr.message, status: 500 };
    }
  }

  const variantRows = sorted.map((item, position) => {
    const label = item.size ?? "Default";
    return {
      product_id: product.id,
      item_id: item.id,
      price_key: `item:${item.id}`,
      title: hasSizes ? label : baseName,
      option1: hasSizes ? label : null,
      sku: `ITEM-${item.id}`,
      price: 0,
      currency: "SGD",
      track_inventory: true,
      is_active: true,
      position,
    };
  });

  const { data: variants, error: variantErr } = await admin
    .from("product_variants")
    .insert(variantRows)
    .select("id");

  if (variantErr || !variants?.length) {
    await admin.from("products").delete().eq("id", product.id);
    return { ok: false, error: variantErr?.message ?? "Failed to create variants", status: 500 };
  }

  await syncVariantPricesFromCostings(product.id).catch(() => {});

  return {
    ok: true,
    productId: product.id,
    slug,
    variantIds: variants.map((v: { id: string }) => v.id),
  };
}

export type PublishAllAccessoriesResult = {
  published: Array<{ name: string; slug: string; productId: string; variantCount: number }>;
  skipped: Array<{ name: string; error: string }>;
};

/** Group unpublished sellable accessories by raw item name and publish each family. */
export async function publishAllUnpublishedAccessories(): Promise<PublishAllAccessoriesResult> {
  const admin = supabaseAdmin();

  const [{ data: items }, { data: prices }, { data: published }] = await Promise.all([
    admin
      .from("items")
      .select("id, name, category, size")
      .eq("is_active", true)
      .eq("category", "accessories"),
    admin.from("item_prices").select("item_id, msrp").not("msrp", "is", null),
    admin.from("product_variants").select("item_id").not("item_id", "is", null),
  ]);

  const publishedIds = new Set((published ?? []).map((v: { item_id: number }) => v.item_id));
  const pricedIds = new Set(
    (prices ?? [])
      .filter((p: { msrp: string | number | null }) => parseMoney(p.msrp) != null)
      .map((p: { item_id: number }) => p.item_id),
  );

  const byName = new Map<string, AccessoryFamilyItem[]>();
  for (const item of items ?? []) {
    if (publishedIds.has(item.id) || !pricedIds.has(item.id)) continue;
    const list = byName.get(item.name) ?? [];
    list.push({
      id: item.id,
      name: item.name,
      size: item.size,
      category: item.category,
    });
    byName.set(item.name, list);
  }

  const publishedOut: PublishAllAccessoriesResult["published"] = [];
  const skipped: PublishAllAccessoriesResult["skipped"] = [];

  for (const [name, family] of [...byName.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const result = await publishAccessoryFamily(family);
    if (result.ok) {
      publishedOut.push({
        name,
        slug: result.slug,
        productId: result.productId,
        variantCount: result.variantIds.length,
      });
    } else {
      skipped.push({ name, error: result.error });
    }
  }

  return { published: publishedOut, skipped };
}
