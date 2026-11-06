import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { requireAdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { isSlideInPageKey, SLIDE_IN_PAGES } from "@/lib/slide-in-pages/pages";
import { reorderableSlugs, slideInSectionViews, type SlideInSectionRow } from "@/lib/slide-in-pages/sections";
import { listSlideInRows } from "@/lib/slide-in-pages/store";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

const ReorderSchema = z.object({ order: z.array(z.string().min(1).max(64)).min(1) });

/**
 * PUT /api/slide-in-sections/[page]/reorder
 * `{ order: slug[] }` — every section of the sub page (not the header), in the new order.
 *
 * The new order is a draft. One upsert writes every row, creating rows for sections that
 * had none (published at their code position, so the live sheet does not move), so the
 * order never passes through a half-applied state.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ page: string }> }) {
  let ctx;
  try {
    ctx = await requireAdminContext("page-builder");
  } catch (res) {
    return res as NextResponse;
  }

  const { page } = await params;
  if (!isSlideInPageKey(page)) {
    return NextResponse.json({ error: "No such sub page" }, { status: 404 });
  }

  try {
    const { order } = ReorderSchema.parse(await req.json());
    const expected = reorderableSlugs(page);

    if (new Set(order).size !== order.length) {
      return NextResponse.json({ error: "Order lists a section twice" }, { status: 400 });
    }
    if (order.length !== expected.length || order.some((slug) => !expected.includes(slug))) {
      return NextResponse.json(
        { error: `Order must list every section exactly once (expected ${expected.length}, got ${order.length}).` },
        { status: 400 },
      );
    }

    const rows = await listSlideInRows(page);
    const before = slideInSectionViews(page, rows, "draft").filter((v) => !v.header).map((v) => v.slug);
    const bySlug = new Map(rows.map((row) => [row.slug, row]));
    const config = SLIDE_IN_PAGES[page].sections;
    const now = new Date().toISOString();

    const upserts: SlideInSectionRow[] = order.map((slug, index) => {
      const existing = bySlug.get(slug);
      if (existing) {
        return {
          ...existing,
          draft_position: existing.position === index ? null : index,
          updated_at: now,
        };
      }
      const codeIndex = config.findIndex((s) => s.key === slug);
      return {
        id: randomUUID(),
        page,
        slug,
        section_type: config[codeIndex]!.type,
        position: codeIndex,
        visible: true,
        content: {},
        draft_content: null,
        draft_position: codeIndex === index ? null : index,
        draft_visible: null,
        created_at: now,
        updated_at: now,
      };
    });

    const { error } = await supabaseAdmin()
      .from("slide_in_sections")
      .upsert(upserts, { onConflict: "page,slug" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await recordAdminAction({
      actor: ctx,
      action: "slide_in_section.reorder",
      entityType: "slide_in_page",
      entityId: page,
      before: { order: before },
      after: { order },
    });

    return NextResponse.json({ ok: true });
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
