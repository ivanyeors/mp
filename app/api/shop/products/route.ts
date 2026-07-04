import { NextResponse } from "next/server";
import {
  attachStockAvailable,
  CUSTOM_COMPOSED_PRODUCT_TYPES,
} from "@/lib/ecommerce/products";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
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
    // Public catalog: accessories and other non-custom sellables only.
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
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = await attachStockAvailable(data ?? []);

  return NextResponse.json({ ok: true, rows, total: count ?? 0, page, limit });
}

export async function POST() {
  const denied = await requireAdmin("products");
  if (denied) return denied;

  // Free-form product creation is retired. Sellable products come from inventory:
  // pillows/bolsters via sync, single items via POST /api/shop/products/from-inventory.
  return NextResponse.json(
    {
      ok: false,
      error: "Free-form product creation is disabled. Use Add from inventory (or Sync from Inventory for pillows/bolsters).",
    },
    { status: 400 },
  );
}
