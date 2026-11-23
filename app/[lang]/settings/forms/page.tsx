import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { DISCOVERY_SOURCE_READ_FAILED, getDiscoverySourceCatalogOrThrow } from "@/lib/discovery-source";
import FormsSettingsPage, { type FormsInitialData } from "./forms-client";

export const runtime = "nodejs";

export default async function FormsSettingsRoute({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  await requireAdminPage("forms", locale);

  const initialData: FormsInitialData = await getDiscoverySourceCatalogOrThrow().then(
    (catalog) => ({ ok: true, catalog }),
    (err: unknown) => {
      console.error("[forms] discovery source read failed:", err instanceof Error ? err.message : err);
      return { error: DISCOVERY_SOURCE_READ_FAILED };
    },
  );
  return <FormsSettingsPage initialData={initialData} />;
}
