import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { withLocale } from "@/lib/i18n/routing";
import { listAdminCustomers } from "@/lib/ecommerce/admin/customers";
import { customerFilterParams, parseCustomerFilters, searchParamsFromRecord } from "@/lib/crm/customer-filters";
import { getMigrationSummary } from "@/lib/customer-migration/overview";
import { getSiteSettings } from "@/lib/site-settings";
import { SLA_SETTING_KEYS, parseSlaSettings } from "@/lib/sla-reminders";
import { readTelegramUpdates } from "@/lib/crm/telegram-updates-server";
import { readAftercareCard } from "@/lib/aftercare/card-server";
import type { AftercareCardData } from "@/lib/aftercare/settings";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/site-url";
import { parseFollowUpScope } from "@/lib/crm/followup-rules";
import { parseReviewTabScope } from "@/lib/crm/reviews";
import { listSegments } from "@/lib/crm/segments";
import { CustomersClient, type CustomersInitialData } from "./customers-client";
import { CustomersPageTabs } from "./customers-page-tabs";
import type { TelegramUpdatesCardData } from "./telegram-updates-card";
import { parseCustomersView } from "./views";

export const runtime = "nodejs";

/** Rows per page, as the client asks for them. */
const LIMIT = 20;

/**
 * Customers list. The first page the client used to fetch on mount
 * (`GET /api/shop/customers?page=1&limit=20`) is read here instead, so the
 * table renders in the first paint. The API route stays in place for search,
 * pagination and refreshes.
 *
 * The list reads the Customer overview (migration slice 12). Its filters live
 * in the URL (`?account=no-account&source=shopify`, and CRM slice 04's
 * `?bought=premium&last_order=over:12&readjusted=never`), so a filtered list is
 * a link: this page reads the same parameters and renders that list first.
 *
 * The saved Segments (CRM slice 05) are read here with their live counts, and
 * sit above the list. Choosing one writes its filters into the URL, so a
 * Segment's link opens this same page.
 *
 * `?view=followups` opens the Follow-ups tab (CRM slice 06), on the list
 * `?scope=` names (mine, all, overdue); the tab reads its own rows.
 *
 * `?view=reviews` opens the Reviews tab (CRM slice 12: *Google reviews to
 * match*, linked from the daily Telegram update), on `?scope=to-match` or
 * `unlinked`; the tab reads its own rows.
 *
 * `?view=settings` opens the Settings tab (CRM slices 07 and 14), whose cards
 * are read here too when the page opens on it. Seeing them needs `customers`;
 * changing them needs `customers-edit`, and the online Result switch also
 * `results`.
 */
export default async function SettingsCustomersPage({
    params,
    searchParams,
}: {
    params: Promise<{ lang: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const [{ lang }, query] = await Promise.all([params, searchParams]);
    const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

    const ctx = await requireAdminPage("customers", locale);
    const view = parseCustomersView(query.view);
    const scope = Array.isArray(query.scope) ? query.scope[0] : query.scope;

    // The client's first state: the URL's filters, page 1, LIMIT 20. A value
    // the schema does not know is dropped here and named on the list.
    const { filters, ignored } = parseCustomerFilters(searchParamsFromRecord(query));
    const first = { ...filters, page: 1, limit: LIMIT };

    const [customers, migration, segments, telegramUpdates, aftercare] = await Promise.all([
        listAdminCustomers(customerFilterParams(first, { paging: true })),
        getMigrationSummary(),
        // The Segments row (CRM slice 05), with live counts; on a failure the row fetches them.
        listSegments().catch(() => undefined),
        view === "settings" ? readTelegramUpdatesCard() : Promise.resolve(undefined),
        view === "settings" ? readAftercareCardData() : Promise.resolve(undefined),
    ]);

    // On a read failure fall through to the client's own fetch rather than
    // rendering a misleading empty list.
    const initialData: CustomersInitialData | undefined = customers.ok
        ? { customers }
        : undefined;

    const canEdit = hasPermission(ctx, "customers-edit");
    return (
        <CustomersPageTabs
            initialView={view}
            canEdit={canEdit}
            canEditOnlineResult={canEdit && hasPermission(ctx, "results")}
            telegramUpdates={telegramUpdates}
            aftercare={aftercare}
            followUpScope={parseFollowUpScope(scope)}
            reviewScope={parseReviewTabScope(scope)}
            importHref={
                hasPermission(ctx, "customer-import")
                    ? withLocale("/settings/customers/import", locale)
                    : undefined
            }
            importFittingsHref={
                hasPermission(ctx, "customer-import")
                    ? withLocale("/settings/customers/import-fittings", locale)
                    : undefined
            }
        >
            <CustomersClient
                initialData={initialData}
                initialFilters={first}
                ignoredFilters={ignored}
                migration={migration}
                initialSegments={segments}
                canEdit={canEdit}
                canEmail={hasPermission(ctx, "campaigns")}
            />
        </CustomersPageTabs>
    );
}

/** The Telegram updates card's data, or undefined so the card fetches it and says why. */
async function readTelegramUpdatesCard(): Promise<TelegramUpdatesCardData | undefined> {
    try {
        const [settings, stored] = await Promise.all([
            readTelegramUpdates(),
            getSiteSettings([...SLA_SETTING_KEYS]),
        ]);
        return { settings, heldReminderTelegram: parseSlaSettings(stored).remindTelegram };
    } catch {
        return undefined;
    }
}

/** The Aftercare card's data, or undefined so the card fetches it and says why. */
async function readAftercareCardData(): Promise<AftercareCardData | undefined> {
    try {
        return await readAftercareCard(supabaseAdmin(), { origin: getSiteOrigin() });
    } catch {
        return undefined;
    }
}
