import {
  attachStockAvailable,
  CUSTOM_COMPOSED_PRODUCT_TYPES,
} from "@/lib/ecommerce/products";
import { supabaseAdmin } from "@/lib/supabase/server";

export type CostVisibility = { canSeeCost: boolean };

export function withoutCostPrice<T extends object>(variant: T): Omit<T, "cost_price"> {
  return Object.fromEntries(Object.entries(variant).filter(([key]) => key !== "cost_price")) as Omit<T, "cost_price">;
}

function withoutVariantCost<T>(product: T): T {
  const variants = (product as { product_variants?: object[] | null }).product_variants;
  if (!Array.isArray(variants)) return product;
  return { ...product, product_variants: variants.map(withoutCostPrice) };
}

export interface AdminProductsListPayload {
  ok: true;
  rows: unknown[];
  total: number;
  page: number;
  limit: number;
}

export type AdminProductsListResult =
  | AdminProductsListPayload
  | { ok: false; error: string };

export async function listAdminProducts(
  searchParams: URLSearchParams,
  { canSeeCost }: CostVisibility,
): Promise<AdminProductsListResult> {
  const status = searchParams.get("status");
  const category_id = searchParams.get("category_id");
  const product_type = searchParams.get("product_type");
  const featured = searchParams.get("featured");
  const search = searchParams.get("search");
  const includeCustom = searchParams.get("include_custom") === "true";
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
  const sort = searchParams.get("sort") ?? "newest";

  const admin = supabaseAdmin();
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = admin.from("products").select("*, product_variants(*), product_images(*)", { count: "exact" });

  if (status) query = query.eq("status", status);
  if (category_id) query = query.eq("category_id", category_id);
  if (product_type) {
    const types = product_type.split(",").map((t) => t.trim()).filter(Boolean);
    if (types.length === 1) query = query.eq("product_type", types[0]);
    else if (types.length > 1) query = query.in("product_type", types);
  } else if (!includeCustom) {
    query = query.not("product_type", "in", `(${CUSTOM_COMPOSED_PRODUCT_TYPES.join(",")})`);
  }
  if (featured === "true") query = query.eq("featured", true);
  if (search) query = query.ilike("slug", `%${search}%`);

  switch (sort) {
    case "price-asc":
    case "title":
      query = query.order("slug", { ascending: true });
      break;
    case "price-desc":
      query = query.order("created_at", { ascending: false });
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }

  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) return { ok: false, error: error.message };

  const rows = await attachStockAvailable(data ?? []);

  return { ok: true, rows: canSeeCost ? rows : rows.map(withoutVariantCost), total: count ?? 0, page, limit };
}

export interface AdminProductPayload {
  ok: true;
  row: unknown;
}

export type AdminProductResult = AdminProductPayload | { ok: false; error: string };

export async function getAdminProduct(id: string, { canSeeCost }: CostVisibility): Promise<AdminProductResult> {
  const admin = supabaseAdmin();

  const { data, error } = await admin
    .from("products")
    .select("*, product_variants(*), product_images(*), product_options(*)")
    .eq("id", id)
    .single();

  if (error) return { ok: false, error: "Product not found" };
  return { ok: true, row: canSeeCost ? data : withoutVariantCost(data) };
}
