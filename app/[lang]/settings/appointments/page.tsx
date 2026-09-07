import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { getAppointmentSettings } from "@/lib/appointments/settings-store";
import { getLocations } from "@/lib/locations";
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

  // Same class of bug as the sibling pages: falling back to the defaults here
  // presents them as the *saved* settings and skips the client's mount fetch,
  // so an admin could save the defaults over real values. Leave `initialData`
  // undefined instead and let the client fetch and report the failure.
  const [settings, locations] = await Promise.all([
    getAppointmentSettings().catch(() => null),
    // Same `locations`-tagged read as the booking picker; a miss just means the
    // sheet fetches on open.
    getLocations().catch(() => null),
  ]);
  return (
    <AppointmentSettingsPage
      initialData={settings ?? undefined}
      initialLocations={locations ?? undefined}
    />
  );
}
