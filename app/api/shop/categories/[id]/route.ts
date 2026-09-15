import { NextResponse } from "next/server";
import { invalidateTag } from "@/lib/cache/invalidate";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";
import { touchLastUsed } from "@/lib/media-assets";

export const runtime = "nodejs";

const UpdateCategorySchema = z.object({
  slug: z.string().trim().min(1).max(300).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  content: z.record(
    z.string(),
    z.object({
      name: z.string().min(1),
      description: z.string().optional().default(""),
    })
  ).optional(),
  parent_id: z.string().uuid().nullable().optional(),
  image_url: z.string().url().nullable().optional(),
  media_asset_id: z.string().uuid().nullable().optional(),
  position: z.number().int().nonnegative().optional(),
  is_active: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin("categories");
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = UpdateCategorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("categories")
    .update(parsed.data)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    const isDup = /duplicate key|unique/i.test(error.message);
    return NextResponse.json(
      { error: isDup ? "A category with this slug already exists" : error.message },
      { status: isDup ? 409 : 500 }
    );
  }

  const imageUrl = parsed.data.image_url;
  if (
    (typeof imageUrl === "string" && imageUrl.startsWith("http")) ||
    parsed.data.media_asset_id
  ) {
    await touchLastUsed({
      urls: typeof imageUrl === "string" && imageUrl.startsWith("http") ? [imageUrl] : [],
      assetIds: parsed.data.media_asset_id ? [parsed.data.media_asset_id] : [],
    }).catch(() => {});
  }

  invalidateTag("categories");
  return NextResponse.json({ ok: true, row: data });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin("categories");
  if (denied) return denied;

  const { id } = await params;
  const admin = supabaseAdmin();
  const { error } = await admin
    .from("categories")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  invalidateTag("categories");
  return NextResponse.json({ ok: true });
}
