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
 * in the URL (`?account=no-account&source=shopify`), so a filtered list is a
 * link: this page reads the same parameters and renders that list first.
 *
 * `?view=settings` opens the Settings tab (CRM slice 14), whose card is read
 * here too when the page opens on it. Seeing it needs `customers`; changing it
 * needs `customers-edit`, and the online Result switch also `results`.
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

    // The client's first state: the URL's filters, page 1, LIMIT 20.
    const { filters } = parseCustomerFilters(searchParamsFromRecord(query));
    const first = { ...filters, page: 1, limit: LIMIT };

    const [customers, migration, telegramUpdates] = await Promise.all([
        listAdminCustomers(customerFilterParams(first, { paging: true })),
        getMigrationSummary(),
        view === "settings" ? readTelegramUpdatesCard() : Promise.resolve(undefined),
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
            importHref={
                hasPermission(ctx, "customer-import")
                    ? withLocale("/settings/customers/import", locale)
                    : undefined
            }
        >
            <CustomersClient initialData={initialData} initialFilters={first} migration={migration} />
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
