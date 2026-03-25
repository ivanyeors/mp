import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { z } from "zod/v4";

export const runtime = "nodejs";

const ReorderSchema = z.object({
  order: z.array(z.string().uuid()).min(1),
});

/**
 * PUT /api/landing-sections/reorder
 * Accepts { order: string[] } — an array of section IDs in the desired order.
 * Updates all positions in bulk.
 */
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { order } = ReorderSchema.parse(body);

    const admin = supabaseAdmin();

    // Update each section's position
    const updates = order.map((id, index) =>
      admin
        .from("landing_sections")
        .update({ position: index, updated_at: new Date().toISOString() })
        .eq("id", id)
    );

    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      return NextResponse.json({ error: failed.error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
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
