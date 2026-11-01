import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { CustomerImportClient } from "./import-client";
import { loadImportHistory } from "./history";
import { loadDefaultConsentCounts } from "./consent-counts";

export const runtime = "nodejs";

/**
 * Customers → Import from Shopify (PRD-shopify-customer-migration, slices 02
 * and 03). Guarded by its own key, `customer-import`: Manager and Staff hold
 * `customers`, and must not bulk-write Customers. The page reads the export in
 * the browser, previews it, imports it in chunks, and lists every Import batch
 * with its Undo. The file is never uploaded or stored. Below them, *Subscribe
 * imported customers* (ADR 0039) starts every imported customer subscribed,
 * except the people on Shopify's unsubscribed list.
 */
export default async function CustomerImportPage({
    params,
}: {
    params: Promise<{ lang: string }>;
}) {
    const { lang } = await params;
    const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

    await requireAdminPage("customer-import", locale);

    const [history, consent] = await Promise.all([loadImportHistory(), loadDefaultConsentCounts()]);
    return <CustomerImportClient history={history} consent={consent} />;
}
