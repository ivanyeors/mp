import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { FittingImportClient } from "./import-client";
import { loadFittingImportHistory } from "./history";

export const runtime = "nodejs";

export default async function FittingImportPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

    await requireAdminPage("customer-import", locale);

    return <FittingImportClient history={await loadFittingImportHistory()} />;
}
