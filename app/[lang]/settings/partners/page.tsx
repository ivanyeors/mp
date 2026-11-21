import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { getPartnersPageRow, listAdminLocationRows } from "@/lib/partners";
import PartnersSettingsPage from "./partners-client";

export const runtime = "nodejs";

export default async function PartnersSettingsRoute({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  await requireAdminPage("partners", locale);

  const [row, partners] = await Promise.all([
    getPartnersPageRow(),
    listAdminLocationRows().catch(() => null),
  ]);

  return (
    <PartnersSettingsPage
      initialData={
        partners
          ? {
              page: { ok: true, row },
              partners: { ok: true, partners },
            }
          : undefined
      }
    />
  );
}
