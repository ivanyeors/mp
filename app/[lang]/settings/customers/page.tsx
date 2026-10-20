import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { listAdminCustomers } from "@/lib/ecommerce/admin/customers";
import type { Customer } from "@/lib/types/ecommerce";
import { CustomersClient, type CustomersInitialData } from "./customers-client";

export const runtime = "nodejs";

/**
 * Customers list. The first page the client used to fetch on mount
 * (`GET /api/shop/customers?page=1&limit=20`) is read here instead, so the
 * table renders in the first paint. The API route stays in place for search,
 * pagination and refreshes.
 */
export default async function SettingsCustomersPage({
    params,
}: {
    params: Promise<{ lang: string }>;
}) {
    const { lang } = await params;
    const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

    const ctx = await requireAdminPage("customers", locale);

    // Mirrors the client's default state: no search, page 1, LIMIT 20.
    const customers = await listAdminCustomers(
        new URLSearchParams({ page: "1", limit: "20" }),
    );

    // On a read failure fall through to the client's own fetch rather than
    // rendering a misleading empty list.
    const initialData: CustomersInitialData | undefined = customers.ok
        ? { customers: { ...customers, rows: customers.rows as Customer[] } }
        : undefined;

    return (
        <CustomersClient
            initialData={initialData}
            canImport={hasPermission(ctx, "customer-import")}
        />
    );
}
