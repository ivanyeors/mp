import { NextResponse } from "next/server";
import { invalidateTag } from "@/lib/cache/invalidate";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getCategoryTree } from "@/lib/ecommerce/categories";
import { requireAdmin } from "@/lib/auth/admin";
import { touchLastUsed } from "@/lib/media-assets";

export const runtime = "nodejs";

const CreateCategorySchema = z.object({
  slug: z.string().trim().min(1).max(300).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  content: z.record(
    z.string(),
    z.object({
      name: z.string().min(1),
      description: z.string().optional().default(""),
    })
  ).default({}),
  parent_id: z.string().uuid().nullable().optional().default(null),
  image_url: z.string().url().nullable().optional().default(null),
  media_asset_id: z.string().uuid().nullable().optional().default(null),
  position: z.number().int().nonnegative().optional().default(0),
  is_active: z.boolean().optional().default(true),
});

export async function GET() {
  const tree = await getCategoryTree();
  return NextResponse.json({ ok: true, rows: tree });
}

export async function POST(req: Request) {
  const denied = await requireAdmin("categories");
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = CreateCategorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("categories")
    .insert(parsed.data)
    .select("*")
    .single();

  if (error) {
    const isDup = /duplicate key|unique/i.test(error.message);
    return NextResponse.json(
      { error: isDup ? "A category with this slug already exists" : error.message },
      { status: isDup ? 409 : 500 }
    );
  }

  await touchLastUsed({
    urls:
      typeof parsed.data.image_url === "string" && parsed.data.image_url.startsWith("http")
        ? [parsed.data.image_url]
        : [],
    assetIds: parsed.data.media_asset_id ? [parsed.data.media_asset_id] : [],
  }).catch(() => {});

  invalidateTag("categories");
  return NextResponse.json({ ok: true, row: data });
}
