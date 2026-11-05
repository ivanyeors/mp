import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { requireAdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { isSlideInPageKey } from "@/lib/slide-in-pages/pages";
import { diffSlideInSnapshot, type SlideInSnapshotSection } from "@/lib/slide-in-pages/sections";
import { listSlideInRows } from "@/lib/slide-in-pages/store";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Matches the retention bound in publish_slide_in_draft. */
const LIST_LIMIT = 50;

type Params = { params: Promise<{ page: string }> };

/** GET — this sub page's **Publish snapshots**, newest first, with what restoring each would change. */
export async function GET(_req: Request, { params }: Params) {
  try {
    await requireAdminContext("page-builder");
  } catch (res) {
    return res as NextResponse;
  }
  const { page } = await params;
  if (!isSlideInPageKey(page)) {
    return NextResponse.json({ error: "No such sub page" }, { status: 404 });
  }

  try {
    const [{ data, error }, live] = await Promise.all([
      supabaseAdmin()
        .from("slide_in_page_publishes")
        .select("id, sections, published_at, published_by")
        .eq("page", page)
        .order("published_at", { ascending: false })
        .limit(LIST_LIMIT),
      listSlideInRows(page),
    ]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const snapshots = (
      (data ?? []) as Array<{ id: string; sections: SlideInSnapshotSection[]; published_at: string; published_by: string | null }>
    ).map((snap) => ({
      id: snap.id,
      published_at: snap.published_at,
      published_by: snap.published_by,
      sectionCount: Array.isArray(snap.sections) ? snap.sections.length : 0,
      diff: diffSlideInSnapshot(snap.sections ?? [], live),
    }));

    return NextResponse.json({ ok: true, snapshots });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

const RestoreSchema = z.object({ snapshotId: z.string().uuid() });

/**
 * POST — stage a snapshot as this sub page's draft. Never writes published state: Staff
 * review the restore in Preview mode and ship it through the normal Publish.
 */
export async function POST(req: Request, { params }: Params) {
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
    const { snapshotId } = RestoreSchema.parse(await req.json());
    const admin = supabaseAdmin();

    // The function restores whichever page the snapshot belongs to; make sure that is
    // the page Staff are looking at.
    const { data: snap, error: readError } = await admin
      .from("slide_in_page_publishes")
      .select("id, page")
      .eq("id", snapshotId)
      .maybeSingle();
    if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
    if (!snap || snap.page !== page) {
      return NextResponse.json({ error: "That version isn't from this page." }, { status: 404 });
    }

    const { data, error } = await admin.rpc("restore_slide_in_snapshot", { snapshot_id: snapshotId });
    if (error) {
      const status = /not found/i.test(error.message) ? 404 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }

    await recordAdminAction({
      actor: ctx,
      action: "slide_in_section.restore_snapshot",
      entityType: "slide_in_page",
      entityId: page,
      after: { snapshotId, stagedSections: data },
    });

    return NextResponse.json({ ok: true, staged: data });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
