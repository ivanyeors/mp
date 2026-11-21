import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { getAppointmentSettings } from "@/lib/appointments/settings-store";
import { getLocations } from "@/lib/locations";
import AppointmentSettingsPage from "./appointments-client";

export const runtime = "nodejs";

export default async function AppointmentSettingsRoute({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  await requireAdminPage("appointments", locale);

  const [settings, locations] = await Promise.all([
    getAppointmentSettings().catch(() => null),
    getLocations().catch(() => null),
  ]);
  return (
    <AppointmentSettingsPage
      initialData={settings ?? undefined}
      initialLocations={locations ?? undefined}
    />
  );
}
