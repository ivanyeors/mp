import { supabaseAdmin } from "@/lib/supabase/server";
import { syncVariantPricesFromCostings } from "@/lib/shop/price-sync";

interface SyncResult {
  pillows: { created: number; updated: number };
  bolsters: { created: number; updated: number };
  items: { archived: number; adopted: number; legacy: number };
}

/**
 * Sync pillow products from inventory system into ecommerce products table.
 * Creates products with is_auto_generated=true, one per kind (basic/premium).
 * Creates variants per size, linked via pillow_product_id.
 */
export async function syncPillowProducts(): Promise<{ created: number; updated: number }> {
  const admin = supabaseAdmin();
  let created = 0;
  let updated = 0;

  // Fetch all pillow_products with their prices
  const { data: pillowProducts, error } = await admin
    .from("pillow_products")
    .select("id, size, kind, is_active")
    .eq("is_active", true);

  if (error || !pillowProducts) return { created: 0, updated: 0 };

  // Fetch categories to find the pillow category
  const { data: categories } = await admin
    .from("categories")
    .select("id")
    .eq("slug", "pillows")
    .single();

  const pillowCategoryId = categories?.id ?? null;

  // Group by kind to create one product per kind
  const byKind = new Map<string, typeof pillowProducts>();
  for (const pp of pillowProducts) {
    const kind = pp.kind ?? "basic";
    if (!byKind.has(kind)) byKind.set(kind, []);
    byKind.get(kind)!.push(pp);
  }

  for (const [kind, products] of byKind) {
    const slug = kind === "basic" ? "mpillow-basic" : `mpillow-${kind}`;
    const titleEn = kind === "basic" ? "Mpillow" : `Mpillow ${kind.charAt(0).toUpperCase() + kind.slice(1)}`;
    const titleZh = kind === "basic" ? "定制枕头" : `定制枕头 (${kind})`;

    // Upsert product
    const { data: existingProduct } = await admin
      .from("products")
      .select("id")
      .eq("slug", slug)
      .single();

    let productId: string;

    if (existingProduct) {
      productId = existingProduct.id;
      updated++;
    } else {
      const { data: newProduct, error: insertErr } = await admin
        .from("products")
        .insert({
          slug,
          product_type: "pillow",
          status: "active",
          is_auto_generated: true,
          category_id: pillowCategoryId,
          featured: kind === "basic",
          tags: ["pillow", kind],
          content: {
            "en-US": {
              title: titleEn,
              description: `Custom-fit ${kind} pillow tailored to your sleep style`,
              body: "",
              seo_title: `${titleEn} - Custom Pillow`,
              seo_description: `Build your perfect ${kind} pillow with our customization system`,
            },
            "zh-CN": {
              title: titleZh,
              description: `根据您的睡眠方式量身定制的${kind === "basic" ? "基础" : "高级"}枕头`,
              body: "",
              seo_title: `${titleZh} - 定制枕头`,
              seo_description: `使用我们的定制系统打造您的完美枕头`,
            },
          },
        })
        .select("id")
        .single();

      if (insertErr || !newProduct) continue;
      productId = newProduct.id;
      created++;
    }

    // Create product option for size
    const { data: existingOption } = await admin
      .from("product_options")
      .select("id")
      .eq("product_id", productId)
      .eq("name", "Size")
      .single();

    if (!existingOption) {
      await admin.from("product_options").insert({
        product_id: productId,
        name: "Size",
        position: 0,
        values: products.map((p) => p.size),
      });
    }

    // Create/update variants per size
    const sizes = ["XS", "S", "M", "L", "XL"];
    for (let i = 0; i < products.length; i++) {
      const pp = products[i];
      const sizeIndex = sizes.indexOf(pp.size);

      const { data: existingVariant } = await admin
        .from("product_variants")
        .select("id")
        .eq("product_id", productId)
        .eq("pillow_product_id", pp.id)
        .single();

      if (!existingVariant) {
        await admin.from("product_variants").insert({
          product_id: productId,
          pillow_product_id: pp.id,
          title: `Size ${pp.size}`,
          sku: `${slug}-${pp.size}`.toUpperCase(),
          option1: pp.size,
          price: 0,
          currency: "SGD",
          track_inventory: true,
          is_active: true,
          position: sizeIndex >= 0 ? sizeIndex : i,
        });
      }
    }
    // Populate price from costings if available (no-op when costings not yet set).
    await syncVariantPricesFromCostings(productId).catch(() => {});
  }

  return { created, updated };
}

/**
 * Sync bolster products from inventory system.
 * Creates a single bolster product with variants per length (short/medium/long).
 */
export async function syncBolsterProducts(): Promise<{ created: number; updated: number }> {
  const admin = supabaseAdmin();
  let created = 0;
  let updated = 0;

  // Fetch bolster category
  const { data: categories } = await admin
    .from("categories")
    .select("id")
    .eq("slug", "bolsters")
    .single();

  const bolsterCategoryId = categories?.id ?? null;

  // Check if bolster BOM lines exist
  const { data: bomLines } = await admin
    .from("bolster_bom_lines")
    .select("variant")
    .limit(1);

  if (!bomLines || bomLines.length === 0) return { created: 0, updated: 0 };

  // Get distinct bolster variants
  const { data: variants } = await admin
    .from("bolster_bom_lines")
    .select("variant");

  const distinctVariants = [...new Set((variants ?? []).map((v: { variant: string }) => v.variant))];

  const slug = "mbolster";

  // Upsert product
  const { data: existingProduct } = await admin
    .from("products")
    .select("id")
    .eq("slug", slug)
    .single();

  let productId: string;

  if (existingProduct) {
    productId = existingProduct.id;
    updated++;
  } else {
    const { data: newProduct, error: insertErr } = await admin
      .from("products")
      .insert({
        slug,
        product_type: "bolster",
        status: "active",
        is_auto_generated: true,
        category_id: bolsterCategoryId,
        featured: true,
        tags: ["bolster"],
        content: {
          "en-US": {
            title: "Mbolster",
            description: "Custom support bolster for comfort",
            body: "",
            seo_title: "Mbolster - Support Bolster",
            seo_description: "Premium support bolster available in three lengths",
          },
          "zh-CN": {
            title: "定制抱枕",
            description: "舒适支撑抱枕",
            body: "",
            seo_title: "定制抱枕 - 支撑抱枕",
            seo_description: "三种长度可选的高级支撑抱枕",
          },
        },
      })
      .select("id")
      .single();

    if (insertErr || !newProduct) return { created, updated };
    productId = newProduct.id;
    created++;
  }

  // Create product option for length
  const { data: existingOption } = await admin
    .from("product_options")
    .select("id")
    .eq("product_id", productId)
    .eq("name", "Length")
    .single();

  if (!existingOption) {
    await admin.from("product_options").insert({
      product_id: productId,
      name: "Length",
      position: 0,
      values: distinctVariants,
    });
  }

  // Create variants per length
  const variantOrder = ["short", "medium", "long"];
  for (const variant of distinctVariants) {
    const { data: existingVariant } = await admin
      .from("product_variants")
      .select("id")
      .eq("product_id", productId)
      .eq("option1", variant)
      .single();

    if (!existingVariant) {
      await admin.from("product_variants").insert({
        product_id: productId,
        title: `${variant.charAt(0).toUpperCase() + variant.slice(1)}`,
        sku: `MBOLSTER-${variant.toUpperCase()}`,
        option1: variant,
        price_key: `product:bolster:${variant}`,
        price: 0,
        currency: "SGD",
        track_inventory: true,
        is_active: true,
        position: variantOrder.indexOf(variant),
      });
    }
  }
  // Populate price from costings if available (no-op when costings not yet set).
  await syncVariantPricesFromCostings(productId).catch(() => {});

  return { created, updated };
}

/**
 * Archive single-item products whose inventory item lost its MSRP or was deactivated.
 * Re-activate (draft) when the item becomes sellable again.
 * Never deletes — preserves history, images, and Stripe linkage.
 */
export async function archiveUnsellableItemProducts(): Promise<{ archived: number }> {
  const admin = supabaseAdmin();

  const { data: variants } = await admin
    .from("product_variants")
    .select("id, product_id, item_id")
    .not("item_id", "is", null);

  if (!variants?.length) return { archived: 0 };

  const itemIds = [...new Set(variants.map((v: { item_id: number }) => v.item_id))];
  const [{ data: items }, { data: prices }] = await Promise.all([
    admin.from("items").select("id, is_active").in("id", itemIds),
    admin.from("item_prices").select("item_id, msrp").in("item_id", itemIds),
  ]);

  const activeById = new Map((items ?? []).map((i: { id: number; is_active: boolean }) => [i.id, i.is_active]));
  const msrpById = new Map(
    (prices ?? [])
      .filter((p: { msrp: string | number | null }) => p.msrp != null)
      .map((p: { item_id: number }) => [p.item_id, true]),
  );

  const sellableByProduct = new Map<string, boolean>();
  for (const v of variants as { product_id: string; item_id: number }[]) {
    const active = activeById.get(v.item_id) === true;
    const hasMsrp = msrpById.has(v.item_id);
    // A product is sellable if ANY of its item-linked variants is sellable.
    sellableByProduct.set(v.product_id, (sellableByProduct.get(v.product_id) ?? false) || (active && hasMsrp));
  }

  let archived = 0;
  for (const [productId, sellable] of sellableByProduct) {
    const { data: product } = await admin
      .from("products")
      .select("id, status")
      .eq("id", productId)
      .eq("is_auto_generated", true)
      .single();
    if (!product) continue;

    if (!sellable && product.status !== "archived") {
      const { error } = await admin.from("products").update({ status: "archived" }).eq("id", productId);
      if (!error) archived++;
    } else if (sellable && product.status === "archived") {
      // Restore to draft so the operator can re-publish deliberately.
      await admin.from("products").update({ status: "draft" }).eq("id", productId);
      await syncVariantPricesFromCostings(productId).catch(() => {});
    }
  }

  return { archived };
}

/**
 * Adopt manual products that map to a sellable inventory item; leave the rest as legacy.
 * Matching: existing item_id link, or case-insensitive title/sku/name match against sellable items.
 */
export async function adoptManualProducts(): Promise<{ adopted: number; legacy: number }> {
  const admin = supabaseAdmin();

  const { data: products } = await admin
    .from("products")
    .select("id, content, product_variants(id, item_id, sku, title, price_key)")
    .eq("is_auto_generated", false);

  if (!products?.length) return { adopted: 0, legacy: 0 };

  const [{ data: items }, { data: prices }] = await Promise.all([
    admin.from("items").select("id, name, subtype, size, is_active").eq("is_active", true),
    admin.from("item_prices").select("item_id, msrp").not("msrp", "is", null),
  ]);

  const sellableIds = new Set((prices ?? []).map((p: { item_id: number }) => p.item_id));
  const itemsById = new Map(
    (items ?? [])
      .filter((i: { id: number }) => sellableIds.has(i.id))
      .map((i: { id: number; name: string; subtype: string | null; size: string | null }) => [i.id, i]),
  );

  // name / "name subtype" / "name size" → item_id
  const itemsByName = new Map<string, number>();
  for (const item of itemsById.values()) {
    const keys = [
      item.name,
      [item.name, item.subtype].filter(Boolean).join(" "),
      [item.name, item.size].filter(Boolean).join(" "),
      [item.name, item.subtype, item.size].filter(Boolean).join(" "),
    ];
    for (const key of keys) {
      if (key) itemsByName.set(key.toLowerCase().trim(), item.id);
    }
  }

  let adopted = 0;
  let legacy = 0;

  for (const product of products) {
    const variants = (product.product_variants ?? []) as Array<{
      id: string;
      item_id: number | null;
      sku: string | null;
      title: string | null;
      price_key: string | null;
    }>;

    const content = product.content as Record<string, { title?: string }> | null;
    const productTitle = (content?.["en-US"]?.title ?? content?.["en"]?.title ?? "").toLowerCase().trim();

    let matchedItemId: number | null = null;
    let matchedVariantId: string | null = null;

    for (const v of variants) {
      if (v.item_id != null && itemsById.has(v.item_id)) {
        matchedItemId = v.item_id;
        matchedVariantId = v.id;
        break;
      }
      const candidates = [v.title, v.sku, productTitle].filter(Boolean) as string[];
      for (const c of candidates) {
        const id = itemsByName.get(c.toLowerCase().trim());
        if (id != null) {
          matchedItemId = id;
          matchedVariantId = v.id;
          break;
        }
      }
      if (matchedItemId != null) break;
    }

    if (matchedItemId == null || matchedVariantId == null) {
      legacy++;
      continue;
    }

    await admin
      .from("product_variants")
      .update({ item_id: matchedItemId, price_key: `item:${matchedItemId}` })
      .eq("id", matchedVariantId);

    await admin.from("products").update({ is_auto_generated: true }).eq("id", product.id);
    await syncVariantPricesFromCostings(product.id).catch(() => {});
    adopted++;
  }

  return { adopted, legacy };
}

/**
 * Run full inventory sync — pillows + bolsters + single-item lifecycle.
 */
export async function syncAllProducts(): Promise<SyncResult> {
  const pillows = await syncPillowProducts();
  const bolsters = await syncBolsterProducts();
  const { archived } = await archiveUnsellableItemProducts();
  const { adopted, legacy } = await adoptManualProducts();
  return { pillows, bolsters, items: { archived, adopted, legacy } };
}
