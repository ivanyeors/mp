import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireSettingsAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

const CreateVariantSchema = z.object({
  sku: z.string().nullable().optional().default(null),
  title: z.string().nullable().optional().default(null),
  option1: z.string().nullable().optional().default(null),
  option2: z.string().nullable().optional().default(null),
  option3: z.string().nullable().optional().default(null),
  price: z.number().min(0),
  compare_at_price: z.number().min(0).nullable().optional().default(null),
  cost_price: z.number().min(0).nullable().optional().default(null),
  currency: z.string().optional().default("MYR"),
  stock_quantity: z.number().int().optional().default(0),
  track_inventory: z.boolean().optional().default(true),
  weight_grams: z.number().int().nullable().optional().default(null),
  image_url: z.string().nullable().optional().default(null),
  is_active: z.boolean().optional().default(true),
  position: z.number().int().optional().default(0),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = supabaseAdmin();

  const { data, error } = await admin
    .from("product_variants")
    .select("*")
    .eq("product_id", id)
    .order("position", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rows: data ?? [] });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSettingsAuth();
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = CreateVariantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();

  // Auto-calculate position
  const { count } = await admin
    .from("product_variants")
    .select("*", { count: "exact", head: true })
    .eq("product_id", id);

  const row = { ...parsed.data, product_id: id, position: parsed.data.position || (count ?? 0) };

  const { data, error } = await admin.from("product_variants").insert(row).select("*").single();
  if (error) {
    const isDup = /duplicate key|unique/i.test(error.message);
    return NextResponse.json(
      { error: isDup ? "A variant with this SKU already exists" : error.message },
      { status: isDup ? 409 : 500 }
    );
  }
  return NextResponse.json({ ok: true, row: data });
}
