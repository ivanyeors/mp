import { NextResponse } from "next/server";
import { revalidateTag, unstable_cache } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  SLA_SETTING_KEYS,
  parseSlaSettings,
  slaSettingsToStored,
} from "@/lib/sla-reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PutSchema = z.object({
  workingDays: z.number().int().min(1).max(30).optional(),
  reminderIntervalDays: z.number().int().min(1).max(14).optional(),
  remindTelegram: z.boolean().optional(),
  remindEmail: z.boolean().optional(),
  opsEmail: z.union([z.string().email(), z.literal(""), z.null()]).optional(),
  authExpiryBufferHours: z.number().int().min(1).max(72).optional(),
});

/**
 * Cached service-role read of the SLA keys; shares the `site-settings` tag that
 * every `site_settings` writer invalidates. Auth stays outside the cache.
 */
const readStoredSlaSettings = unstable_cache(
  async (): Promise<Record<string, string>> => {
    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from("site_settings")
      .select("key, value")
      .in("key", [...SLA_SETTING_KEYS]);
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
    return NextResponse.json({ ok: true, settings: parseSlaSettings(stored) });
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
    .in("key", [...SLA_SETTING_KEYS]);
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
      }).filter(([, v]) => v !== undefined),
    ),
    opsEmail:
      input.opsEmail === undefined
        ? current.opsEmail
        : input.opsEmail === "" || input.opsEmail === null
          ? null
          : input.opsEmail,
  };

  const rows = Object.entries(slaSettingsToStored(next)).map(([key, value]) => ({
    key,
    value,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await admin.from("site_settings").upsert(rows, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidateTag("site-settings", "max");
  return NextResponse.json({ ok: true, settings: next });
}
