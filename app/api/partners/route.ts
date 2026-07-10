import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";
import { touchLastUsed } from "@/lib/media-assets";

export const runtime = "nodejs";

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  logo_url: z.string().nullable().optional(),
  media_asset_id: z.string().uuid().nullable().optional().default(null),
  website_url: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  visible: z.boolean().optional().default(true),
});

export async function GET() {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("partners")
    .select("*")
    .order("position", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, partners: data ?? [] });
}

export async function POST(req: Request) {
  const denied = await requireAdmin("page-builder");
  if (denied) return denied;

  try {
    const body = await req.json();
    const parsed = CreateSchema.parse(body);
    const admin = supabaseAdmin();

    const { data: maxRow } = await admin
      .from("partners")
      .select("position")
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextPosition = (maxRow?.position ?? -1) + 1;

    const { data, error } = await admin
      .from("partners")
      .insert({
        name: parsed.name,
        logo_url: parsed.logo_url ?? null,
        media_asset_id: parsed.media_asset_id ?? null,
        website_url: parsed.website_url ?? null,
        description: parsed.description ?? null,
        visible: parsed.visible,
        position: nextPosition,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await touchLastUsed({
      urls:
        typeof parsed.logo_url === "string" && parsed.logo_url.startsWith("http")
          ? [parsed.logo_url]
          : [],
      assetIds: parsed.media_asset_id ? [parsed.media_asset_id] : [],
    }).catch(() => {});

    return NextResponse.json({ ok: true, partner: data }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
