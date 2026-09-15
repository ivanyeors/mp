import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth/user";
import { linkCustomerToAuthUser } from "@/lib/auth/customer-identity";

export const runtime = "nodejs";

/** What the storefront may see of a review: never customer_id, order_id or status. */
const PUBLIC_COLUMNS = "id, rating, title, body, author_name, created_at";

const CreateReviewSchema = z.object({
  product_id: z.string().uuid(),
  order_id: z.string().uuid().nullable().optional().default(null),
  author_name: z.string().trim().min(1).max(200),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(300).nullable().optional().default(null),
  body: z.string().trim().max(5000).nullable().optional().default(null),
});

/** Approved reviews for one product. `?status=` is ignored: only approved rows are public. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const product_id = z.string().uuid().safeParse(searchParams.get("product_id"));
  if (!product_id.success) {
    return NextResponse.json({ error: "product_id is required" }, { status: 400 });
  }
  const page = Math.max(parseInt(searchParams.get("page") ?? "1", 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "20", 10) || 20, 1), 100);
  const from = (page - 1) * limit;

  const { data, error, count } = await supabaseAdmin()
    .from("product_reviews")
    .select(PUBLIC_COLUMNS, { count: "exact" })
    .eq("product_id", product_id.data)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .range(from, from + limit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rows: data ?? [], total: count ?? 0, page, limit });
}

/** A signed-in Customer submits a review; it waits as pending for staff approval. */
export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to write a review" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = CreateReviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const customer = await linkCustomerToAuthUser(user);
  const admin = supabaseAdmin();

  if (parsed.data.order_id) {
    const { data: order } = await admin
      .from("orders")
      .select("id, order_items(product_variants(product_id))")
      .eq("id", parsed.data.order_id)
      .eq("customer_id", customer.id)
      .maybeSingle();
    // order_items.variant_id is many-to-one, so the embed is an object; the untyped client infers an array.
    const items = (order?.order_items ?? []) as unknown as { product_variants: { product_id: string } | null }[];
    if (!items.some((i) => i.product_variants?.product_id === parsed.data.product_id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { data, error } = await admin
    .from("product_reviews")
    .insert({ ...parsed.data, customer_id: customer.id, status: "pending" })
    .select(PUBLIC_COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, row: data }, { status: 201 });
}
