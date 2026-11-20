import { NextResponse } from "next/server";
import { invalidateTag } from "@/lib/cache/invalidate";
import { requireAdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { hasPermission } from "@/lib/auth/permissions";
import { readAftercareCard, readAftercareSettings } from "@/lib/aftercare/card-server";
import { aftercareSettingsPatchSchema, applyAftercareSettingsPatch } from "@/lib/aftercare/settings";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getPublicOrigin } from "@/lib/site-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  let ctx;
  try {
    ctx = await requireAdminContext("customers");
  } catch (res) {
    return res as NextResponse;
  }

  try {
    const card = await readAftercareCard(supabaseAdmin(), { origin: getPublicOrigin(req) });
    return NextResponse.json({ ok: true, ...card, canEdit: hasPermission(ctx, "customers-edit") });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  let ctx;
  try {
    ctx = await requireAdminContext("customers-edit");
  } catch (res) {
    return res as NextResponse;
  }

  const body = await req.json().catch(() => null);
  const parsed = aftercareSettingsPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();
  let current;
  try {
    current = await readAftercareSettings(admin);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }

  const change = applyAftercareSettingsPatch(current, parsed.data);
  if (!change.ok) return NextResponse.json({ error: change.error }, { status: 400 });

  const updatedAt = new Date().toISOString();
  const { error } = await admin
    .from("site_settings")
    .upsert(
      change.rows.map((row) => ({ ...row, updated_at: updatedAt })),
      { onConflict: "key" },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  invalidateTag("site-settings");
  await recordAdminAction({
    actor: ctx,
    action: "aftercare_settings.update",
    entityType: "site_setting",
    entityId: change.rows.map((r) => r.key).join(","),
    before: current,
    after: change.next,
  });
  return NextResponse.json({ ok: true, settings: change.next });
}
