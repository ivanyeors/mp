import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireSettingsAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

const CreateProductSchema = z.object({
  slug: z.string().trim().min(1).max(300).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  product_type: z.enum(["pillow", "bolster", "accessory", "bundle"]).default("pillow"),
  status: z.enum(["draft", "active", "archived"]).default("draft"),
  content: z.record(z.string(), z.object({
    title: z.string().min(1),
    description: z.string().optional().default(""),
    body: z.string().optional().default(""),
    seo_title: z.string().optional().default(""),
    seo_description: z.string().optional().default(""),
    seo_keywords: z.array(z.string()).optional().default([]),
  })).default({}),
  category_id: z.string().uuid().nullable().optional().default(null),
  featured: z.boolean().optional().default(false),
  tags: z.array(z.string()).optional().default([]),
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const category_id = searchParams.get("category_id");
  const product_type = searchParams.get("product_type");
  const featured = searchParams.get("featured");
  const search = searchParams.get("search");
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

  return NextResponse.json({ ok: true, rows: data ?? [], total: count ?? 0, page, limit });
}

export async function POST(req: Request) {
  const denied = await requireSettingsAuth();
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = CreateProductSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const row: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.status === "active") {
    row.published_at = new Date().toISOString();
  }

  const { data, error } = await admin.from("products").insert(row).select("*").single();
  if (error) {
    const isDup = /duplicate key|unique/i.test(error.message);
    return NextResponse.json(
      { error: isDup ? "A product with this slug already exists" : error.message },
      { status: isDup ? 409 : 500 }
    );
  }
  return NextResponse.json({ ok: true, row: data });
}
