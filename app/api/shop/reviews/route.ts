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

/** Public byline from the Customer record ("Jane D."), so a review can't borrow someone else's name. */
function bylineFor(customer: { first_name: string | null; last_name: string | null }): string | null {
  const first = customer.first_name?.trim();
  if (!first) return null;
  const initial = customer.last_name?.trim()[0];
  return (initial ? `${first} ${initial}.` : first).slice(0, 200);
}

/** Approved reviews for one product. `?status=` is ignored: only approved rows are public. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const product_id = z.string().uuid().safeParse(searchParams.get("product_id"));
  if (!product_id.success) {
    return NextResponse.json({ error: "product_id is required" }, { status: 400 });
  }
  // ponytail: 1000 pages of approved reviews is far past any real product; it keeps the offset sane.
  const page = Math.min(Math.max(parseInt(searchParams.get("page") ?? "1", 10) || 1, 1), 1000);
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "20", 10) || 20, 1), 100);
  const from = (page - 1) * limit;

  const { data, error, count } = await supabaseAdmin()
    .from("product_reviews")
    .select(PUBLIC_COLUMNS, { count: "exact" })
    .eq("product_id", product_id.data)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .range(from, from + limit - 1);

  if (error) {
    console.error("[shop/reviews] list failed", error.message);
    return NextResponse.json({ error: "Failed to load reviews" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, rows: data ?? [], total: count ?? 0, page, limit });
}

/** A signed-in Customer submits a review; it waits as pending for staff approval. */
export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to write a review" }, { status: 401 });
  }
  // A Customer is linked by email; a phone-only account has none to link.
  if (!user.email) {
    return NextResponse.json({ error: "Add an email to your account to write a review" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = CreateReviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const customer = await linkCustomerToAuthUser(user).catch(() => null);
  if (!customer) {
    return NextResponse.json({ error: "Failed to submit review" }, { status: 500 });
  }
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
    .insert({ ...parsed.data, author_name: bylineFor(customer) ?? parsed.data.author_name, customer_id: customer.id, status: "pending" })
    .select(PUBLIC_COLUMNS)
    .single();
  if (error) {
    console.error("[shop/reviews] insert failed", error.message);
    return NextResponse.json({ error: "Failed to submit review" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, row: data }, { status: 201 });
}
