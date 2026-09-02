import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { DEFAULT_APPOINTMENT_SETTINGS } from "@/lib/appointments/settings";
import { getAppointmentSettings } from "@/lib/appointments/settings-store";
import AppointmentSettingsPage from "./appointments-client";

export const runtime = "nodejs";

/**
 * The appointment settings come from the same `site-settings`-tagged read that
 * backs `/api/settings/appointments`, so the calendar mounts with real
 * availability instead of waiting on a fetch after hydration.
 */
export default async function AppointmentSettingsRoute({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  await requireAdminPage("results", locale);

  const settings = await getAppointmentSettings().catch(
    () => DEFAULT_APPOINTMENT_SETTINGS,
  );
  return <AppointmentSettingsPage initialData={settings} />;
}
