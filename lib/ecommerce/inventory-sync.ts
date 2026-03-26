import { supabaseAdmin } from "@/lib/supabase/server";

interface SyncResult {
  pillows: { created: number; updated: number };
  bolsters: { created: number; updated: number };
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
          price: 0, // To be set by admin
          currency: "MYR",
          track_inventory: true,
          is_active: true,
          position: sizeIndex >= 0 ? sizeIndex : i,
        });
      }
    }
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
        price: 0,
        currency: "MYR",
        track_inventory: true,
        is_active: true,
        position: variantOrder.indexOf(variant),
      });
    }
  }

  return { created, updated };
}

/**
 * Run full inventory sync — pillows + bolsters.
 */
export async function syncAllProducts(): Promise<SyncResult> {
  const pillows = await syncPillowProducts();
  const bolsters = await syncBolsterProducts();
  return { pillows, bolsters };
}
