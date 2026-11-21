import { supabaseAdmin } from "@/lib/supabase/server";
import { repriceFromCostings } from "@/lib/shop/price-sync";
import type { StripeWarning } from "@/lib/shop/stripe-warnings";
import { syncItemImageToProducts } from "@/lib/ecommerce/item-image-sync";
import { sizeSortKey } from "@/lib/ecommerce/inventory-families";

export { sizeSortKey };


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

export type AccessoryFamilyItem = {
  id: number;
  name: string;
  size: string | null;
  category: string;
};

export type PublishFamilyResult =
  | { ok: true; productId: string; slug: string; variantIds: string[]; stripeWarnings: StripeWarning[] }
  | { ok: false; error: string; status: number };

function variantRowsFor(
  productId: string,
  items: AccessoryFamilyItem[],
  sized: boolean,
  title: string,
  firstPosition: number,
) {
  return items.map((item, i) => {
    const label = item.size ?? "Default";
    return {
      product_id: productId,
      item_id: item.id,
      price_key: `item:${item.id}`,
      title: sized ? label : title,
      option1: sized ? label : null,
      sku: `ITEM-${item.id}`,
      price: 0,
      currency: "SGD",
      track_inventory: true,
      is_active: true,
      position: firstPosition + i,
    };
  });
}

async function syncFamilyImages(itemIds: number[]): Promise<void> {
  const admin = supabaseAdmin();
  const { data: imaged } = await admin
    .from("items")
    .select("id, primary_media_asset_id")
    .in("id", itemIds)
    .not("primary_media_asset_id", "is", null);
  for (const it of imaged ?? []) {
    await syncItemImageToProducts(admin, it.id, null, it.primary_media_asset_id).catch(() => {});
  }
}

export async function publishAccessoryFamily(
  items: AccessoryFamilyItem[],
  title?: string,
  opts: { status?: "active" | "draft" } = {},
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
      status: opts.status ?? "active",
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

  const { data: variants, error: variantErr } = await admin
    .from("product_variants")
    .insert(variantRowsFor(product.id, sorted, hasSizes, baseName, 0))
    .select("id");

  if (variantErr || !variants?.length) {
    await admin.from("products").delete().eq("id", product.id);
    return { ok: false, error: variantErr?.message ?? "Failed to create variants", status: 500 };
  }

  const stripeWarnings = await repriceFromCostings({ id: product.id, name: baseName }, "Add from Inventory");
  await syncFamilyImages(sorted.map((i) => i.id));

  return {
    ok: true,
    productId: product.id,
    slug,
    variantIds: variants.map((v: { id: string }) => v.id),
    stripeWarnings,
  };
}

export async function addSizesToProduct(
  productId: string,
  items: AccessoryFamilyItem[],
): Promise<PublishFamilyResult> {
  if (items.length === 0) return { ok: false, error: "No items to add", status: 400 };

  const admin = supabaseAdmin();
  const ids = items.map((i) => i.id);

  const [{ data: product }, { data: options }, { data: variants }, { data: taken }] = await Promise.all([
    admin.from("products").select("id, slug, content").eq("id", productId).maybeSingle(),
    admin.from("product_options").select("id, name, values").eq("product_id", productId),
    admin.from("product_variants").select("id, position, option1").eq("product_id", productId),
    admin.from("product_variants").select("item_id").in("item_id", ids),
  ]);

  if (!product) return { ok: false, error: "Product not found", status: 404 };
  if (taken && taken.length > 0) {
    return {
      ok: false,
      error: `Already published: item_id ${taken.map((t: { item_id: number }) => t.item_id).join(", ")}`,
      status: 409,
    };
  }

  const sizeOption = (options ?? []).find(
    (o: { name: string }) => o.name.toLowerCase() === "size",
  ) as { id: string; values: string[] | null } | undefined;
  const sized = Boolean(sizeOption);
  if (items.some((i) => Boolean(i.size) !== sized)) {
    return {
      ok: false,
      error: sized
        ? "This product is sold in sizes, so an item with no size can't join it. Give the item a size in Inventory."
        : "This product has no sizes, so a sized item can't join it. Give the item its own name in Inventory.",
      status: 409,
    };
  }

  const sorted = [...items].sort((a, b) => sizeSortKey(a.size) - sizeSortKey(b.size));
  const content = product.content as Record<string, { title?: string }> | null;
  const title = content?.["en-US"]?.title ?? sorted[0]!.name;
  const lastPosition = Math.max(
    -1,
    ...((variants ?? []) as Array<{ position: number | null }>).map((v) => v.position ?? 0),
  );

  const { data: inserted, error: insertErr } = await admin
    .from("product_variants")
    .insert(variantRowsFor(productId, sorted, sized, title, lastPosition + 1))
    .select("id");
  if (insertErr || !inserted?.length) {
    return { ok: false, error: insertErr?.message ?? "Failed to add variants", status: 500 };
  }

  if (sizeOption) {
    const values = [...new Set([...(sizeOption.values ?? []), ...sorted.map((i) => i.size!)])].sort(
      (a, b) => sizeSortKey(a) - sizeSortKey(b),
    );
    await admin.from("product_options").update({ values }).eq("id", sizeOption.id);
  }

  const stripeWarnings = await repriceFromCostings({ id: productId, name: title }, "Add from Inventory");
  await syncFamilyImages(ids);

  return {
    ok: true,
    productId,
    slug: product.slug as string,
    variantIds: inserted.map((v: { id: string }) => v.id),
    stripeWarnings,
  };
}

export type PublishAllAccessoriesResult = {
  published: Array<{
    name: string;
    slug: string;
    productId: string;
    variantCount: number;
    stripeWarnings: StripeWarning[];
  }>;
  skipped: Array<{ name: string; error: string }>;
};

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
        stripeWarnings: result.stripeWarnings,
      });
    } else {
      skipped.push({ name, error: result.error });
    }
  }

  return { published: publishedOut, skipped };
}
