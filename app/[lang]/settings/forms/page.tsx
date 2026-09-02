import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { readDiscoverySourceCatalog } from "@/lib/discovery-source/cached";
import FormsSettingsPage from "./forms-client";

export const runtime = "nodejs";

/**
 * The discovery-source catalog comes from the same `site-settings`-tagged read
 * that backs `/api/settings/forms/discovery-source`, so the page mounts with
 * its options instead of fetching them after hydration.
 */
export default async function FormsSettingsRoute({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  await requireAdminPage("page-builder", locale);

  const catalog = await readDiscoverySourceCatalog();
  return <FormsSettingsPage initialData={{ ok: true, catalog }} />;
}
