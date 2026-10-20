import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { CustomerImportClient } from "./import-client";

export const runtime = "nodejs";

/**
 * Customers → Import from Shopify (PRD-shopify-customer-migration, slice 02).
 * Guarded by its own key, `customer-import`: Manager and Staff hold
 * `customers`, and must not bulk-write Customers. The page reads the export in
 * the browser and previews it; the file is never uploaded or stored.
 */
export default async function CustomerImportPage({
    params,
}: {
    params: Promise<{ lang: string }>;
}) {
    const { lang } = await params;
    const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

    await requireAdminPage("customer-import", locale);

    return <CustomerImportClient />;
}
