import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { FittingImportClient } from "./import-client";
import { loadFittingImportHistory } from "./history";

export const runtime = "nodejs";

/**
 * Customers → Import fittings (ADR 0042). Guarded by `customer-import`, as
 * Import from Shopify is: it creates Customers. The page reads the Google Form
 * export in the browser, previews it, imports it in chunks, and lists every
 * import with its Undo. The file is never uploaded or stored.
 */
export default async function FittingImportPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

    await requireAdminPage("customer-import", locale);

    return <FittingImportClient history={await loadFittingImportHistory()} />;
}
