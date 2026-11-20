import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { listAdminCustomers } from "@/lib/ecommerce/admin/customers";
import { customerFilterParams, parseCustomerFilters, searchParamsFromRecord } from "@/lib/crm/customer-filters";
import { supabaseAdmin } from "@/lib/supabase/server";
import { listCampaignFilterOptions } from "@/lib/email-campaigns/store";
import { CustomerFiltersPageClient } from "./filters-page-client";

export const runtime = "nodejs";

export default async function CustomerFiltersPage({
    params,
    searchParams,
}: {
    params: Promise<{ lang: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const [{ lang }, query] = await Promise.all([params, searchParams]);
    const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

    await requireAdminPage("customers", locale);

    const { filters, ignored } = parseCustomerFilters(searchParamsFromRecord(query));
    const [count, campaigns] = await Promise.all([
        listAdminCustomers(customerFilterParams({ ...filters, page: 1, limit: 1 }, { paging: true })),
        listCampaignFilterOptions(supabaseAdmin(), filters.campaign ? [filters.campaign.id] : []).catch(() => []),
    ]);

    return (
        <CustomerFiltersPageClient
            initialFilters={filters}
            ignoredFilters={ignored}
            campaigns={campaigns}
            initialCount={count.ok ? { total: count.total, shipsToUnknown: count.shipsToUnknown } : null}
        />
    );
}
