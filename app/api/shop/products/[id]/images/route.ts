import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";
import { touchLastUsed } from "@/lib/media-assets";

export const runtime = "nodejs";

const CreateImageSchema = z.object({
  url: z.string().min(1),
  alt_text: z.string().nullable().optional().default(null),
  media_asset_id: z.string().uuid().nullable().optional().default(null),
  variant_id: z.string().uuid().nullable().optional().default(null),
  position: z.number().int().optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = supabaseAdmin();

  const { data, error } = await admin
    .from("product_images")
    .select("*")
    .eq("product_id", id)
    .order("position", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rows: data ?? [] });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("products");
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = CreateImageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();

  // Auto-calculate position if not provided
  let position = parsed.data.position;
  if (position === undefined) {
    const { count } = await admin
      .from("product_images")
      .select("*", { count: "exact", head: true })
      .eq("product_id", id);
    position = count ?? 0;
  }

  const { data, error } = await admin
    .from("product_images")
    .insert({ ...parsed.data, product_id: id, position })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await touchLastUsed({
    urls: parsed.data.url.startsWith("http") ? [parsed.data.url] : [],
    assetIds: parsed.data.media_asset_id ? [parsed.data.media_asset_id] : [],
  }).catch(() => {});

  return NextResponse.json({ ok: true, row: data });
}
