import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { z } from "zod/v4";
import { requireAdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { listLandingSectionRows } from "@/lib/landing-sections";
import { diffSnapshot, type PublishSnapshot, type SnapshotSection } from "@/lib/page-builder/draft";

export const runtime = "nodejs";

const LIST_LIMIT = 50;

export async function GET() {
  try {
    await requireAdminContext("page-builder");
  } catch (res) {
    return res as NextResponse;
  }

  try {
    const admin = supabaseAdmin();
    const [{ data, error }, live] = await Promise.all([
      admin
        .from("landing_page_publishes")
        .select("id, sections, published_at, published_by")
        .order("published_at", { ascending: false })
        .limit(LIST_LIMIT),
      listLandingSectionRows(),
    ]);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const snapshots = ((data ?? []) as PublishSnapshot[]).map((snap) => ({
      id: snap.id,
      published_at: snap.published_at,
      published_by: snap.published_by,
      sectionCount: Array.isArray(snap.sections) ? snap.sections.length : 0,
      diff: diffSnapshot((snap.sections ?? []) as SnapshotSection[], live),
    }));

    return NextResponse.json({ ok: true, snapshots });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

const RestoreSchema = z.object({ snapshotId: z.string().uuid() });

export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await requireAdminContext("page-builder");
  } catch (res) {
    return res as NextResponse;
  }

  try {
    const { snapshotId } = RestoreSchema.parse(await req.json());

    const admin = supabaseAdmin();
    const { data, error } = await admin.rpc("restore_landing_snapshot", {
      snapshot_id: snapshotId,
    });

    if (error) {
      const status = /not found/i.test(error.message) ? 404 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }

    await recordAdminAction({
      actor: ctx,
      action: "landing_section.restore_snapshot",
      entityType: "landing_page",
      entityId: snapshotId,
      after: { stagedSections: data },
    });

    return NextResponse.json({ ok: true, staged: data });
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
