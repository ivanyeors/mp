import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/auth/admin";
import { listLandingSections } from "@/lib/landing-sections";

export const runtime = "nodejs";

/**
 * GET /api/landing-sections
 * Returns all sections ordered by position.
 */
export async function GET() {
  try {
    return NextResponse.json({ ok: true, sections: await listLandingSections() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

const CreateSchema = z.object({
  section_type: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  content: z.record(z.string(), z.unknown()).optional().default({}),
});

/**
 * POST /api/landing-sections
 * Creates a new section at the end.
 */
export async function POST(req: Request) {
  const denied = await requireAdmin("page-builder");
  if (denied) return denied;

  try {
    const body = await req.json();
    const parsed = CreateSchema.parse(body);

    const admin = supabaseAdmin();

    // Get next position
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
        visible: true,
        content: parsed.content,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "A section with this slug already exists" }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, section: data }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
