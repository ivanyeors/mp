import { supabaseAdmin } from "@/lib/supabase/server";
import { sanitizeSearchTerm } from "@/lib/supabase/like-pattern";
import type { Product, ProductVariant, ProductImage, ProductOption } from "@/lib/types/ecommerce";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";

export { shopCardPrice } from "./shop-card-price";

export async function attachStockAvailable<
  T extends { product_variants?: { id: string; stock_available?: number }[] }
>(products: T[]): Promise<T[]> {
  const variantIds = products.flatMap((p) => (p.product_variants ?? []).map((v) => v.id));
  if (variantIds.length === 0) return products;

  const admin = supabaseAdmin();
  const { data: stockRows } = await admin
    .from("variant_stock")
    .select("variant_id, stock_available")
    .in("variant_id", variantIds);

  const stockMap = new Map<string, number>(
    (stockRows ?? []).map((r: { variant_id: string; stock_available: number }) => [
      r.variant_id,
      r.stock_available,
    ])
  );

  for (const p of products) {
    for (const v of p.product_variants ?? []) {
      v.stock_available = stockMap.get(v.id) ?? 0;
    }
  }
  return products;
}

export const PUBLIC_PRODUCT_COLUMNS =
  "id, slug, product_type, status, content, category_id, featured, tags, published_at, created_at, updated_at";
export const PUBLIC_VARIANT_COLUMNS =
  "id, product_id, sku, title, option1, option2, option3, price, compare_at_price, currency, track_inventory, weight_grams, image_url, is_active, position";
const PUBLIC_PRODUCT_SELECT = `${PUBLIC_PRODUCT_COLUMNS}, product_variants(${PUBLIC_VARIANT_COLUMNS}), product_images(id, product_id, variant_id, url, alt_text, position)`;

export const CUSTOM_COMPOSED_PRODUCT_TYPES = ["pillow", "bolster"] as const;

export function isShopCatalogProduct(product: { product_type: string }): boolean {
  return !(CUSTOM_COMPOSED_PRODUCT_TYPES as readonly string[]).includes(product.product_type);
}

export function isListedShopProduct(product: {
  status: string;
  product_type: string;
  product_variants?: { is_active: boolean }[] | null;
}): boolean {
  return product.status === "active" && isShopCatalogProduct(product) && (product.product_variants ?? []).some((v) => v.is_active);
}

export interface GetProductsOpts {
  status?: string;
  category_id?: string;
  product_type?: string;
  featured?: boolean;
  search?: string;
  tags?: string[];
  collection_id?: string;
  page?: number;
  limit?: number;
  sort?: string;
  shopCatalogOnly?: boolean;
}

export async function getProducts(opts: GetProductsOpts = {}) {
  const admin = supabaseAdmin();
  const page = opts.page ?? 1;
  const limit = Math.min(opts.limit ?? 20, 100);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = admin.from("products").select(PUBLIC_PRODUCT_SELECT, { count: "exact" });

  if (opts.status) query = query.eq("status", opts.status);
  if (opts.category_id) query = query.eq("category_id", opts.category_id);
  if (opts.product_type) query = query.eq("product_type", opts.product_type);
  // ponytail: filter at query; admin listings pass shopCatalogOnly: false
  else if (opts.shopCatalogOnly !== false) {
    query = query.not("product_type", "in", `(${CUSTOM_COMPOSED_PRODUCT_TYPES.join(",")})`);
  }
  if (opts.featured !== undefined) query = query.eq("featured", opts.featured);
  if (opts.tags?.length) query = query.overlaps("tags", opts.tags);
  if (opts.search) {
    const term = sanitizeSearchTerm(opts.search);
    if (term) {
      query = query.or(`slug.ilike.%${term}%,content->>'en-US'->>'title'.ilike.%${term}%`);
    }
  }

  switch (opts.sort) {
    case "price-asc":
      query = query.order("created_at", { ascending: true });
      break;
    case "price-desc":
      query = query.order("created_at", { ascending: false });
      break;
    case "title":
      query = query.order("slug", { ascending: true });
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }

  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  let products = (data ?? []) as (Product & { product_variants: ProductVariant[]; product_images: ProductImage[] })[];

  if (opts.collection_id) {
    const { data: cpData } = await admin
      .from("collection_products")
      .select("product_id")
      .eq("collection_id", opts.collection_id);
    const productIds = new Set((cpData ?? []).map((cp: { product_id: string }) => cp.product_id));
    products = products.filter((p) => productIds.has(p.id));
  }

  await attachStockAvailable(products);

  return {
    products: products.map((p) => ({
      ...p,
      variants: p.product_variants,
      images: p.product_images,
    })),
    total: count ?? 0,
    page,
    limit,
  };
}

export async function getProductBySlug(slug: string) {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("products")
    .select(`${PUBLIC_PRODUCT_SELECT}, product_options(*)`)
    .eq("slug", slug)
    .single();

  if (error) return null;
  const row = data as Product & {
    product_variants: ProductVariant[];
    product_images: ProductImage[];
    product_options: ProductOption[];
  };
  // ponytail: PDP/SEO still resolve pillow|bolster by slug (FAQ + Product JSON-LD).
  // Listing stays accessories-only via getProducts; checkout rejects plain composed lines.
  await attachStockAvailable([row]);
  return {
    ...row,
    variants: (row.product_variants ?? []).sort((a, b) => a.position - b.position),
    images: (row.product_images ?? []).sort((a, b) => a.position - b.position),
    options: (row.product_options ?? []).sort((a, b) => a.position - b.position),
  };
}

export async function getFeaturedProducts(limit = 8) {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("products")
    .select(PUBLIC_PRODUCT_SELECT)
    .eq("status", "active")
    .eq("featured", true)
    .not("product_type", "in", `(${CUSTOM_COMPOSED_PRODUCT_TYPES.join(",")})`)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  const rows = (data ?? []) as (Product & {
    product_variants: ProductVariant[];
    product_images: ProductImage[];
  })[];
  await attachStockAvailable(rows);
  return rows.map((p) => ({
    ...p,
    variants: p.product_variants ?? [],
    images: p.product_images ?? [],
  }));
}

export function resolveProductContent(product: Product, locale: Locale = DEFAULT_LOCALE) {
  const content = product.content[locale] ?? product.content[DEFAULT_LOCALE] ?? Object.values(product.content)[0];
  return content ?? { title: product.slug, description: "", body: "" };
}

export function getProductPriceRange(variants: ProductVariant[]) {
  const active = variants.filter((v) => v.is_active);
  if (!active.length) return { min: 0, max: 0, currency: "SGD" };
  const prices = active.map((v) => v.price);
  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
    currency: active[0].currency,
  };
}
