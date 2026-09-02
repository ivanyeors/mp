import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { getPartnersPageRow, listAdminLocationRows } from "@/lib/partners";
import PartnersSettingsPage from "./partners-client";

export const runtime = "nodejs";

/**
 * The Work With Us row and the locations table are read on the server (the
 * same payloads `/api/partners-page` and `/api/partners` return) so the page
 * mounts populated instead of fetching after hydration.
 */
export default async function PartnersSettingsRoute({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  await requireAdminPage("page-builder", locale);

  const [row, partners] = await Promise.all([
    getPartnersPageRow(),
    listAdminLocationRows().catch(() => []),
  ]);

  return (
    <PartnersSettingsPage
      initialData={{
        page: { ok: true, row },
        partners: { ok: true, partners },
      }}
    />
  );
}
