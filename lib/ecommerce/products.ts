import { supabaseAdmin } from "@/lib/supabase/server";
import type { Product, ProductVariant, ProductImage, ProductOption } from "@/lib/types/ecommerce";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";

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
  sort?: string; // "newest" | "price-asc" | "price-desc" | "title"
}

export async function getProducts(opts: GetProductsOpts = {}) {
  const admin = supabaseAdmin();
  const page = opts.page ?? 1;
  const limit = Math.min(opts.limit ?? 20, 100);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = admin.from("products").select("*, product_variants(*), product_images(*)", { count: "exact" });

  if (opts.status) query = query.eq("status", opts.status);
  if (opts.category_id) query = query.eq("category_id", opts.category_id);
  if (opts.product_type) query = query.eq("product_type", opts.product_type);
  if (opts.featured !== undefined) query = query.eq("featured", opts.featured);
  if (opts.tags?.length) query = query.overlaps("tags", opts.tags);
  if (opts.search) query = query.or(`slug.ilike.%${opts.search}%,content->>'en-US'->>'title'.ilike.%${opts.search}%`);

  // Sort
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

  // If filtering by collection, we need a separate query
  let products = (data ?? []) as (Product & { product_variants: ProductVariant[]; product_images: ProductImage[] })[];

  if (opts.collection_id) {
    const { data: cpData } = await admin
      .from("collection_products")
      .select("product_id")
      .eq("collection_id", opts.collection_id);
    const productIds = new Set((cpData ?? []).map((cp: { product_id: string }) => cp.product_id));
    products = products.filter((p) => productIds.has(p.id));
  }

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
    .select("*, product_variants(*), product_images(*), product_options(*)")
    .eq("slug", slug)
    .single();

  if (error) return null;
  const row = data as Product & {
    product_variants: ProductVariant[];
    product_images: ProductImage[];
    product_options: ProductOption[];
  };
  return {
    ...row,
    variants: (row.product_variants ?? []).sort((a, b) => a.position - b.position),
    images: (row.product_images ?? []).sort((a, b) => a.position - b.position),
    options: (row.product_options ?? []).sort((a, b) => a.position - b.position),
  };
}

export async function getProductById(id: string) {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("products")
    .select("*, product_variants(*), product_images(*), product_options(*)")
    .eq("id", id)
    .single();

  if (error) return null;
  const row = data as Product & {
    product_variants: ProductVariant[];
    product_images: ProductImage[];
    product_options: ProductOption[];
  };
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
    .select("*, product_variants(*), product_images(*)")
    .eq("status", "active")
    .eq("featured", true)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []).map((p: Product & { product_variants: ProductVariant[]; product_images: ProductImage[] }) => ({
    ...p,
    variants: p.product_variants ?? [],
    images: p.product_images ?? [],
  }));
}

/** Resolve localized product content with fallback */
export function resolveProductContent(product: Product, locale: Locale = DEFAULT_LOCALE) {
  const content = product.content[locale] ?? product.content[DEFAULT_LOCALE] ?? Object.values(product.content)[0];
  return content ?? { title: product.slug, description: "", body: "" };
}

/** Get the lowest price from all active variants */
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
