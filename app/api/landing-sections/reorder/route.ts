import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { z } from "zod/v4";
import { requireAdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";

export const runtime = "nodejs";

const ReorderSchema = z.object({
  order: z.array(z.string().uuid()).min(1),
});

/**
 * PUT /api/landing-sections/reorder
 * Accepts { order: string[] } — every section id, in the desired order.
 *
 * The order must cover the table exactly. Before slice 02 this fired one UPDATE per
 * section through `Promise.all` with no transaction, so a partial failure left
 * duplicate positions and a half-reordered page; and a partial order silently
 * collided with the untouched rows it did not mention.
 */
export async function PUT(req: Request) {
  let ctx;
  try {
    ctx = await requireAdminContext("page-builder");
  } catch (res) {
    return res as NextResponse;
  }

  try {
    const body = await req.json();
    const { order } = ReorderSchema.parse(body);

    const admin = supabaseAdmin();

    const { data: existing, error: readError } = await admin
      .from("landing_sections")
      .select("*")
      .order("position", { ascending: true });

    if (readError) {
      return NextResponse.json({ error: readError.message }, { status: 500 });
    }

    const rows = existing ?? [];
    const byId = new Map(rows.map((row) => [row.id, row]));

    if (new Set(order).size !== order.length) {
      return NextResponse.json({ error: "Order contains duplicate section ids" }, { status: 400 });
    }
    if (order.length !== rows.length || order.some((id) => !byId.has(id))) {
      return NextResponse.json(
        {
          error:
            `Order must list every section exactly once (expected ${rows.length}, got ${order.length}).`,
        },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    // One statement: positions never pass through a half-applied state.
    const { error } = await admin.from("landing_sections").upsert(
      order.map((id, index) => ({ ...byId.get(id)!, position: index, updated_at: now })),
      { onConflict: "id" },
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await recordAdminAction({
      actor: ctx,
      action: "landing_section.reorder",
      entityType: "landing_section",
      before: { order: rows.map((r) => r.slug) },
      after: { order: order.map((id) => byId.get(id)!.slug) },
    });

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
