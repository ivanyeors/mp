import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

const UpdateCollectionSchema = z.object({
  slug: z.string().trim().min(1).max(300).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  collection_type: z.enum(["manual", "auto"]).optional(),
  content: z.record(z.string(), z.object({
    title: z.string().min(1),
    description: z.string().optional().default(""),
  })).optional(),
  image_url: z.string().url().nullable().optional(),
  rules: z.array(z.object({
    field: z.string(),
    condition: z.string(),
    value: z.string(),
  })).optional(),
  sort_order: z.string().optional(),
  is_active: z.boolean().optional(),
  position: z.number().int().nonnegative().optional(),
}).partial();

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = supabaseAdmin();

  const [collectionResult, countResult] = await Promise.all([
    admin.from("collections").select("*").eq("id", id).single(),
    admin.from("collection_products").select("*", { count: "exact", head: true }).eq("collection_id", id),
  ]);

  if (collectionResult.error) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    row: { ...collectionResult.data, product_count: countResult.count ?? 0 },
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = UpdateCollectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("collections")
    .update(parsed.data)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    const isDup = /duplicate key|unique/i.test(error.message);
    return NextResponse.json(
      { error: isDup ? "A collection with this slug already exists" : error.message },
      { status: isDup ? 409 : 500 }
    );
  }
  return NextResponse.json({ ok: true, row: data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = supabaseAdmin();
  const { error } = await admin.from("collections").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
