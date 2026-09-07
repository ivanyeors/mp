import { NextResponse } from "next/server";
import { invalidateTag } from "@/lib/cache/invalidate";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  APPOINTMENT_SETTING_KEYS,
  appointmentSettingsToStored,
  parseAppointmentSettings,
} from "@/lib/appointments/settings";
import { getAppointmentSettings } from "@/lib/appointments/settings-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PutSchema = z.object({
  venue: z.string().min(1).max(500).optional(),
  durationMinutes: z.number().int().min(15).max(240).optional(),
  openHour: z.number().int().min(0).max(23).optional(),
  closeHour: z.number().int().min(0).max(23).optional(),
  bookableDays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
  customisationBookingUrl: z.string().url().optional(),
  readjustmentBookingUrl: z.string().url().optional(),
  customisationSummaryMatch: z.string().min(1).max(200).optional(),
  readjustmentSummaryMatch: z.string().min(1).max(200).optional(),
  slotLookaheadDays: z.number().int().min(1).max(60).optional(),
  slotOfferCount: z.number().int().min(1).max(10).optional(),
  blockedRanges: z
    .array(
      z
        .object({
          start: z.string().min(1),
          end: z.string().min(1),
        })
        .refine(
          (r) => Date.parse(r.start) < Date.parse(r.end),
          "start must be before end",
        ),
    )
    .max(200)
    .optional(),
  showCancelled: z.boolean().optional(),
});

export async function GET() {
  const denied = await requireAdmin("results");
  if (denied) return denied;

  try {
    return NextResponse.json({ ok: true, settings: await getAppointmentSettings() });
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
    .in("key", [...APPOINTMENT_SETTING_KEYS]);
  const stored: Record<string, string> = {};
  for (const row of data ?? []) stored[row.key] = row.value;

  const current = parseAppointmentSettings(stored);
  const input = parsed.data;
  const next = {
    ...current,
    ...Object.fromEntries(
      Object.entries({
        venue: input.venue,
        durationMinutes: input.durationMinutes,
        openHour: input.openHour,
        closeHour: input.closeHour,
        bookableDays: input.bookableDays,
        customisationBookingUrl: input.customisationBookingUrl,
        readjustmentBookingUrl: input.readjustmentBookingUrl,
        customisationSummaryMatch: input.customisationSummaryMatch,
        readjustmentSummaryMatch: input.readjustmentSummaryMatch,
        slotLookaheadDays: input.slotLookaheadDays,
        slotOfferCount: input.slotOfferCount,
        blockedRanges: input.blockedRanges,
        showCancelled: input.showCancelled,
      }).filter(([, v]) => v !== undefined),
    ),
  };

  if (next.openHour > next.closeHour) {
    return NextResponse.json(
      { error: "openHour must be <= closeHour (last bookable start)" },
      { status: 400 },
    );
  }

  const rows = Object.entries(appointmentSettingsToStored(next)).map(([key, value]) => ({
    key,
    value,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await admin.from("site_settings").upsert(rows, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  invalidateTag("site-settings");
  return NextResponse.json({ ok: true, settings: next });
}
