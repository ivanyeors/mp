import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { invalidateTag } from "@/lib/cache/invalidate";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  PAYMENT_REMINDER_SETTING_KEYS,
  parsePaymentReminderSettings,
  paymentReminderSettingsToStored,
} from "@/lib/payment-reminders";
import {
  SLA_SETTING_KEYS,
  parseSlaSettings,
  slaSettingsToStored,
} from "@/lib/sla-reminders";
import { DRAFT_REMINDERS_ENABLED_KEY, parseDraftRemindersEnabled } from "@/lib/draft-reminders";

const ALL_KEYS = [...SLA_SETTING_KEYS, ...PAYMENT_REMINDER_SETTING_KEYS, DRAFT_REMINDERS_ENABLED_KEY];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PutSchema = z.object({
  workingDays: z.number().int().min(1).max(30).optional(),
  reminderIntervalDays: z.number().int().min(1).max(14).optional(),
  remindTelegram: z.boolean().optional(),
  remindEmail: z.boolean().optional(),
  opsEmail: z.union([z.string().email(), z.literal(""), z.null()]).optional(),
  authExpiryBufferHours: z.number().int().min(1).max(72).optional(),
  authHoldEnabled: z.boolean().optional(),
  paymentReminders: z
    .object({
      enabled: z.boolean().optional(),
      firstDelayDays: z.number().int().min(0).max(60).optional(),
      intervalDays: z.number().int().min(1).max(60).optional(),
      maxReminders: z.number().int().min(0).max(10).optional(),
    })
    .optional(),
  draftReminders: z.object({ enabled: z.boolean().optional() }).optional(),
});

const readStoredSlaSettings = unstable_cache(
  async (): Promise<Record<string, string>> => {
    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from("site_settings")
      .select("key, value")
      .in("key", ALL_KEYS);
    if (error) throw new Error(error.message);

    const stored: Record<string, string> = {};
    for (const row of data ?? []) stored[row.key] = row.value;
    return stored;
  },
  ["sla-settings"],
  { tags: ["site-settings"], revalidate: 300 },
);

export async function GET() {
  const denied = await requireAdmin("results");
  if (denied) return denied;

  try {
    const stored = await readStoredSlaSettings();
    return NextResponse.json({
      ok: true,
      settings: parseSlaSettings(stored),
      paymentReminders: parsePaymentReminderSettings(stored),
      draftReminders: { enabled: parseDraftRemindersEnabled(stored[DRAFT_REMINDERS_ENABLED_KEY]) },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  const denied = await requireAdmin("results");
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data } = await admin
    .from("site_settings")
    .select("key, value")
    .in("key", ALL_KEYS);
  const stored: Record<string, string> = {};
  for (const row of data ?? []) stored[row.key] = row.value;

  const current = parseSlaSettings(stored);
  const input = parsed.data;
  const next = {
    ...current,
    ...Object.fromEntries(
      Object.entries({
        workingDays: input.workingDays,
        reminderIntervalDays: input.reminderIntervalDays,
        remindTelegram: input.remindTelegram,
        remindEmail: input.remindEmail,
        authExpiryBufferHours: input.authExpiryBufferHours,
        authHoldEnabled: input.authHoldEnabled,
      }).filter(([, v]) => v !== undefined),
    ),
    opsEmail:
      input.opsEmail === undefined
        ? current.opsEmail
        : input.opsEmail === "" || input.opsEmail === null
          ? null
          : input.opsEmail,
  };

  const currentReminders = parsePaymentReminderSettings(stored);
  const nextReminders = {
    ...currentReminders,
    ...Object.fromEntries(
      Object.entries(input.paymentReminders ?? {}).filter(([, v]) => v !== undefined),
    ),
  };

  const draftRemindersEnabled =
    input.draftReminders?.enabled ?? parseDraftRemindersEnabled(stored[DRAFT_REMINDERS_ENABLED_KEY]);

  const rows = Object.entries({
    ...slaSettingsToStored(next),
    ...paymentReminderSettingsToStored(nextReminders),
    [DRAFT_REMINDERS_ENABLED_KEY]: draftRemindersEnabled ? "true" : "false",
  }).map(([key, value]) => ({
    key,
    value,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await admin.from("site_settings").upsert(rows, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  invalidateTag("site-settings");
  return NextResponse.json({
    ok: true,
    settings: next,
    paymentReminders: nextReminders,
    draftReminders: { enabled: draftRemindersEnabled },
  });
}
