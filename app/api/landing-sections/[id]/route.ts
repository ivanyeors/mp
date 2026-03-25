import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { z } from "zod/v4";

export const runtime = "nodejs";

const PatchSchema = z.object({
  visible: z.boolean().optional(),
  content: z.record(z.string(), z.unknown()).optional(),
  slug: z.string().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
});

/**
 * PATCH /api/landing-sections/[id]
 * Updates a section's visible, content, or slug.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = PatchSchema.parse(body);

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (parsed.visible !== undefined) update.visible = parsed.visible;
    if (parsed.content !== undefined) update.content = parsed.content;
    if (parsed.slug !== undefined) update.slug = parsed.slug;

    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from("landing_sections")
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "A section with this slug already exists" }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Section not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, section: data });
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

/**
 * DELETE /api/landing-sections/[id]
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = supabaseAdmin();

  const { error } = await admin
    .from("landing_sections")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
