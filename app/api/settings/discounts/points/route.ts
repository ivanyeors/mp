import { NextResponse } from "next/server";
import { invalidateTag } from "@/lib/cache/invalidate";
import { requireAdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { supabaseAdmin } from "@/lib/supabase/server";
import { PointsSettingsSchema } from "@/lib/points/settings";
import { readPointsSettings, readPointsSummary, savePointsSettings } from "@/lib/points/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Discounts → Points (PRD-loyalty-points slices 02 and 09): the nine
 * `site_settings` the programme reads, the milestone ladder among them, and
 * what points cost now. Seeing and changing both need `discounts`. 10 points
 * = S$1 is not here: it is fixed in code (ADR 0030 (a)).
 */
export async function GET() {
  try {
    await requireAdminContext("discounts");
  } catch (res) {
    return res as NextResponse;
  }
  try {
    const admin = supabaseAdmin();
    const [settings, summary] = await Promise.all([readPointsSettings(admin), readPointsSummary(admin)]);
    return NextResponse.json({ ok: true, settings, summary });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  let ctx;
  try {
    ctx = await requireAdminContext("discounts");
  } catch (res) {
    return res as NextResponse;
  }

  const parsed = PointsSettingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Check the settings", field: issue?.path.join(".") }, { status: 400 });
  }

  const admin = supabaseAdmin();
  try {
    const before = await readPointsSettings(admin);
    await savePointsSettings(admin, parsed.data);
    const after = await readPointsSettings(admin);
    invalidateTag("site-settings");
    await recordAdminAction({
      actor: ctx,
      action: "points_settings.update",
      entityType: "site_setting",
      entityId: "points",
      before,
      after,
    });
    return NextResponse.json({ ok: true, settings: after });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
