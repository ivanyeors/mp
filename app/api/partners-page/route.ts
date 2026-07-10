import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";
import { getPartnersPageRow } from "@/lib/partners";
import { touchLastUsed } from "@/lib/media-assets";

export const runtime = "nodejs";

const BenefitCardSchema = z.object({
  title: z.string(),
  description: z.string(),
});

const WorkWithUsContentSchema = z.object({
  heroImage: z.string().optional(),
  media_asset_id: z.string().uuid().nullable().optional(),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  body: z.string().optional(),
  benefitCards: z.array(BenefitCardSchema).optional(),
  ctaTitle: z.string().optional(),
  ctaSubtitle: z.string().optional(),
  ctaButtonLabel: z.string().optional(),
  ctaButtonUrl: z.string().optional(),
  showMarquee: z.boolean().optional(),
});

const PatchSchema = z.object({
  content: z.record(z.string(), WorkWithUsContentSchema),
});

export async function GET() {
  const row = await getPartnersPageRow();
  return NextResponse.json({ ok: true, row });
}

export async function PATCH(req: Request) {
  const denied = await requireAdmin("page-builder");
  if (denied) return denied;

  try {
    const body = await req.json();
    const parsed = PatchSchema.parse(body);
    const admin = supabaseAdmin();

    const existing = await getPartnersPageRow();

    let data;
    if (existing) {
      const result = await admin
        .from("partners_page")
        .update({ content: parsed.content })
        .eq("id", existing.id)
        .select("*")
        .single();

      if (result.error) {
        return NextResponse.json({ error: result.error.message }, { status: 500 });
      }
      data = result.data;
    } else {
      const result = await admin
        .from("partners_page")
        .insert({ content: parsed.content })
        .select("*")
        .single();

      if (result.error) {
        return NextResponse.json({ error: result.error.message }, { status: 500 });
      }
      data = result.data;
    }

    const urls: string[] = [];
    const assetIds: string[] = [];
    for (const loc of Object.values(parsed.content)) {
      if (typeof loc.heroImage === "string" && loc.heroImage.startsWith("http")) {
        urls.push(loc.heroImage);
      }
      if (loc.media_asset_id) assetIds.push(loc.media_asset_id);
    }
    await touchLastUsed({ urls, assetIds }).catch(() => {});

    return NextResponse.json({ ok: true, row: data }, { status: existing ? 200 : 201 });
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
