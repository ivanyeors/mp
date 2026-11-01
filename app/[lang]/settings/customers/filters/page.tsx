import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { listAdminCustomers } from "@/lib/ecommerce/admin/customers";
import { customerFilterParams, parseCustomerFilters, searchParamsFromRecord } from "@/lib/crm/customer-filters";
import { supabaseAdmin } from "@/lib/supabase/server";
import { listCampaignFilterOptions } from "@/lib/email-campaigns/store";
import { CustomerFiltersPageClient } from "./filters-page-client";

export const runtime = "nodejs";

/**
 * The Customers list's mega filter, as a page of its own: every filter,
 * grouped, with room for each. It reads and writes the list's own URL
 * parameters, so `/settings/customers/filters?stage=at-risk` opens with that
 * filter set, and *Show N customers* goes back to `/settings/customers` with
 * whatever is set now. The browser's Back returns to the list as it was.
 *
 * The count is read here for the first paint (`listAdminCustomers`, one row),
 * then by the client as the filters change.
 */
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
        // The *Campaign* filter's choices (PRD-campaign-audiences slice 05), with
        // the link's own campaign; on a failure the filter offers none.
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
