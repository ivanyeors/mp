import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { readApiConfigs } from "@/lib/settings/api-configs";
import GeneralSettingsPage from "./general-client";

export const runtime = "nodejs";

/**
 * The API configs come from the same tag-cached service-role read that backs
 * `/api/settings/api-configs`, so the page mounts with its list instead of
 * fetching it after hydration.
 */
export default async function GeneralSettingsRoute({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  await requireAdminPage("api-configs", locale);

  const configs = await readApiConfigs().catch(() => []);
  return <GeneralSettingsPage initialData={configs} />;
}
