import { NextResponse } from "next/server";
import { invalidateTag } from "@/lib/cache/invalidate";
import { z } from "zod/v4";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";
import { listAdminLocationRows } from "@/lib/partners";
import { touchLastUsed } from "@/lib/media-assets";

export const runtime = "nodejs";

// ponytail: table/route still named `partners` (ADR 0012 — no rename); these rows
// are Locations. `type` discriminates own studios from partner clinics.
const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  logo_url: z.string().nullable().optional(),
  media_asset_id: z.string().uuid().nullable().optional().default(null),
  website_url: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  visible: z.boolean().optional().default(true),
  type: z.enum(["own", "partner"]).optional().default("partner"),
  address: z.string().nullable().optional(),
  postal_code: z.string().nullable().optional(),
});

export async function GET() {
  // Returns all locations (own + partner); the /our-partners projection filters own out.
  try {
    return NextResponse.json({ ok: true, partners: await listAdminLocationRows() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
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
        type: parsed.type,
        address: parsed.address ?? null,
        postal_code: parsed.postal_code ?? null,
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

    invalidateTag("locations");
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
