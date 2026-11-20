import { NextResponse } from "next/server";
import { invalidateTag } from "@/lib/cache/invalidate";
import { requireAdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { hasPermission } from "@/lib/auth/permissions";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getSiteSettings } from "@/lib/site-settings";
import { SLA_SETTING_KEYS, parseSlaSettings } from "@/lib/sla-reminders";
import {
  CRM_TELEGRAM_UPDATES_KEY,
  applyTelegramUpdatesPatch,
  changesOnlineResultSwitch,
  telegramUpdatesPatchSchema,
} from "@/lib/crm/telegram-updates";
import { readTelegramUpdates } from "@/lib/crm/telegram-updates-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let ctx;
  try {
    ctx = await requireAdminContext("customers");
  } catch (res) {
    return res as NextResponse;
  }

  try {
    const [settings, sla] = await Promise.all([
      readTelegramUpdates(),
      getSiteSettings([...SLA_SETTING_KEYS]).then(parseSlaSettings),
    ]);
    return NextResponse.json({
      ok: true,
      settings,
      heldReminderTelegram: sla.remindTelegram,
      canEdit: hasPermission(ctx, "customers-edit"),
      canEditOnlineResult: hasPermission(ctx, "customers-edit") && hasPermission(ctx, "results"),
    });
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
  const parsed = telegramUpdatesPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let current;
  try {
    current = await readTelegramUpdates();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }

  if (changesOnlineResultSwitch(current, parsed.data) && !hasPermission(ctx, "results")) {
    return NextResponse.json(
      { error: "Changing the online Result update also needs the Results permission." },
      { status: 403 },
    );
  }

  const next = applyTelegramUpdatesPatch(current, parsed.data);
  const { error } = await supabaseAdmin()
    .from("site_settings")
    .upsert(
      { key: CRM_TELEGRAM_UPDATES_KEY, value: JSON.stringify(next), updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  invalidateTag("site-settings");
  await recordAdminAction({
    actor: ctx,
    action: "crm_telegram_updates.update",
    entityType: "site_setting",
    entityId: CRM_TELEGRAM_UPDATES_KEY,
    before: current,
    after: next,
  });
  return NextResponse.json({ ok: true, settings: next });
}
