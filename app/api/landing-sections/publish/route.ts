import { after, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { listLandingSectionRows } from "@/lib/landing-sections";
import { summarisePending } from "@/lib/page-builder/draft";
import { localePageUrls, pingIndexNow } from "@/lib/seo/indexnow";

export const runtime = "nodejs";

export async function GET() {
  let denied;
  try {
    await requireAdminContext("page-builder");
  } catch (res) {
    denied = res as NextResponse;
  }
  if (denied) return denied;

  try {
    return NextResponse.json({ ok: true, pending: summarisePending(await listLandingSectionRows()) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST() {
  let ctx;
  try {
    ctx = await requireAdminContext("page-builder");
  } catch (res) {
    return res as NextResponse;
  }

  try {
    const pending = summarisePending(await listLandingSectionRows());
    if (pending.total === 0) {
      return NextResponse.json({ error: "There is nothing to publish." }, { status: 409 });
    }

    const admin = supabaseAdmin();
    const { data, error } = await admin.rpc("publish_landing_draft", { actor: ctx.email ?? null });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await recordAdminAction({
      actor: ctx,
      action: "landing_section.publish",
      entityType: "landing_page",
      entityId: typeof data === "string" ? data : null,
      after: pending,
    });

    after(() => pingIndexNow(localePageUrls("")));

    return NextResponse.json({ ok: true, snapshotId: data, published: pending });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  let ctx;
  try {
    ctx = await requireAdminContext("page-builder");
  } catch (res) {
    return res as NextResponse;
  }

  try {
    const pending = summarisePending(await listLandingSectionRows());

    const admin = supabaseAdmin();
    const { error } = await admin.rpc("discard_landing_draft");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await recordAdminAction({
      actor: ctx,
      action: "landing_section.discard_draft",
      entityType: "landing_page",
      before: pending,
    });

    return NextResponse.json({ ok: true, discarded: pending });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
