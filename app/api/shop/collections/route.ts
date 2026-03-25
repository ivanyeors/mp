import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

const CreateCollectionSchema = z.object({
  slug: z.string().trim().min(1).max(300).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  collection_type: z.enum(["manual", "auto"]).default("manual"),
  content: z.record(z.string(), z.object({
    title: z.string().min(1),
    description: z.string().optional().default(""),
  })).default({}),
  image_url: z.string().url().nullable().optional().default(null),
  rules: z.array(z.object({
    field: z.string(),
    condition: z.string(),
    value: z.string(),
  })).optional().default([]),
  sort_order: z.string().optional().default("manual"),
  is_active: z.boolean().optional().default(true),
  position: z.number().int().nonnegative().optional().default(0),
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const active = searchParams.get("active");

  const admin = supabaseAdmin();
  let query = admin
    .from("collections")
    .select("*, collection_products(count)", { count: "exact" })
    .order("position", { ascending: true });

  if (active === "true") query = query.eq("is_active", true);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, rows: data ?? [], total: count ?? 0 });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = CreateCollectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("collections")
    .insert(parsed.data)
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
