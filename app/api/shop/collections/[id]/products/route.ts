import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

const ReplaceProductsSchema = z.object({
  product_ids: z.array(z.string().uuid()),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = supabaseAdmin();

  const { data, error } = await admin
    .from("collection_products")
    .select("product_id, position")
    .eq("collection_id", id)
    .order("position", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    product_ids: (data ?? []).map((row: { product_id: string }) => row.product_id),
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = ReplaceProductsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();

  // Delete existing product associations then upsert the new ordered list
  const { error: deleteError } = await admin
    .from("collection_products")
    .delete()
    .eq("collection_id", id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const { product_ids } = parsed.data;

  if (product_ids.length > 0) {
    const rows = product_ids.map((product_id, index) => ({
      collection_id: id,
      product_id,
      position: index,
    }));

    const { error: insertError } = await admin
      .from("collection_products")
      .insert(rows);

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, product_ids });
}
