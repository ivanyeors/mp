import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { readDiscoverySourceCatalog } from "@/lib/discovery-source/cached";
import FormsSettingsPage from "./forms-client";

export const runtime = "nodejs";

export default async function FormsSettingsRoute({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  await requireAdminPage("forms", locale);

  const catalog = await readDiscoverySourceCatalog();
  return <FormsSettingsPage initialData={{ ok: true, catalog }} />;
}
