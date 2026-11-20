import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { z } from "zod/v4";
import { requireAdmin, requireAdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { listLandingSectionRows } from "@/lib/landing-sections";
import { draftSections, summarisePending } from "@/lib/page-builder/draft";
import {
  CreatableSectionTypeSchema,
  SectionContentSchema,
  SlugSchema,
  isSingletonSectionType,
} from "@/lib/page-builder/validation";

export const runtime = "nodejs";

export async function GET() {
  const denied = await requireAdmin("page-builder");
  if (denied) return denied;

  try {
    const rows = await listLandingSectionRows();
    return NextResponse.json({
      ok: true,
      sections: draftSections(rows),
      pending: summarisePending(rows),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

const CreateSchema = z.object({
  section_type: CreatableSectionTypeSchema,
  slug: SlugSchema,
  content: SectionContentSchema.optional().default({}),
});

export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await requireAdminContext("page-builder");
  } catch (res) {
    return res as NextResponse;
  }

  try {
    const body = await req.json();
    const parsed = CreateSchema.parse(body);

    const admin = supabaseAdmin();

    if (isSingletonSectionType(parsed.section_type)) {
      const { count } = await admin
        .from("landing_sections")
        .select("id", { count: "exact", head: true })
        .eq("section_type", parsed.section_type);
      if ((count ?? 0) > 0) {
        return NextResponse.json(
          {
            error: `The page already has a "${parsed.section_type}" section, and it can only appear once.`,
          },
          { status: 409 },
        );
      }
    }

    const { data: maxRow } = await admin
      .from("landing_sections")
      .select("position")
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextPosition = (maxRow?.position ?? -1) + 1;

    const { data, error } = await admin
      .from("landing_sections")
      .insert({
        section_type: parsed.section_type,
        slug: parsed.slug,
        position: nextPosition,
        visible: false,
        content: parsed.content,
        draft_visible: true,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "A section with this slug already exists" }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await recordAdminAction({
      actor: ctx,
      action: "landing_section.create",
      entityType: "landing_section",
      entityId: data.id,
      after: { slug: data.slug, section_type: data.section_type, position: data.position },
    });

    return NextResponse.json({ ok: true, section: data }, { status: 201 });
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
