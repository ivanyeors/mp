import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";
import { getPartnersPageRow } from "@/lib/partners";

export const runtime = "nodejs";

const BenefitCardSchema = z.object({
  title: z.string(),
  description: z.string(),
});

const WorkWithUsContentSchema = z.object({
  heroImage: z.string().optional(),
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

    if (existing) {
      const { data, error } = await admin
        .from("partners_page")
        .update({ content: parsed.content })
        .eq("id", existing.id)
        .select("*")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, row: data });
    }

    const { data, error } = await admin
      .from("partners_page")
      .insert({ content: parsed.content })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, row: data }, { status: 201 });
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
