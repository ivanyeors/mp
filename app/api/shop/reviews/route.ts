import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

const CreateReviewSchema = z.object({
  product_id: z.string().uuid(),
  customer_id: z.string().uuid().nullable().optional().default(null),
  order_id: z.string().uuid().nullable().optional().default(null),
  author_name: z.string().trim().min(1).max(200),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(300).nullable().optional().default(null),
  body: z.string().trim().nullable().optional().default(null),
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const product_id = searchParams.get("product_id");
  const status = searchParams.get("status");
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);

  const admin = supabaseAdmin();
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = admin.from("reviews").select("*", { count: "estimated" });

  if (product_id) query = query.eq("product_id", product_id);
  if (status) query = query.eq("status", status);

  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, rows: data ?? [], total: count ?? 0, page, limit });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = CreateReviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const row = {
    ...parsed.data,
    status: "pending",
  };

  const { data, error } = await admin.from("reviews").insert(row).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, row: data }, { status: 201 });
}
