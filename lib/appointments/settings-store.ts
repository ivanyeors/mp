import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  APPOINTMENT_SETTING_KEYS,
  parseAppointmentSettings,
  type AppointmentSettings,
} from "./settings";

export const readStoredAppointmentSettings = unstable_cache(
  async (): Promise<Record<string, string>> => {
    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from("site_settings")
      .select("key, value")
      .in("key", [...APPOINTMENT_SETTING_KEYS]);
    if (error) throw new Error(error.message);

    const stored: Record<string, string> = {};
    for (const row of data ?? []) stored[row.key] = row.value;
    return stored;
  },
  ["appointment-settings"],
  { tags: ["site-settings"], revalidate: 300 },
);

export async function getAppointmentSettings(): Promise<AppointmentSettings> {
  return parseAppointmentSettings(await readStoredAppointmentSettings());
}
