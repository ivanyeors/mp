import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { listAdminCustomers } from "@/lib/ecommerce/admin/customers";
import { getSiteSettings } from "@/lib/site-settings";
import { SLA_SETTING_KEYS, parseSlaSettings } from "@/lib/sla-reminders";
import { readTelegramUpdates } from "@/lib/crm/telegram-updates-server";
import type { Customer } from "@/lib/types/ecommerce";
import { CustomersClient, type CustomersInitialData } from "./customers-client";
import { CustomersPageTabs } from "./customers-page-tabs";
import type { TelegramUpdatesCardData } from "./telegram-updates-card";
import { parseCustomersView } from "./views";

export const runtime = "nodejs";

/**
 * Customers list. The first page the client used to fetch on mount
 * (`GET /api/shop/customers?page=1&limit=20`) is read here instead, so the
 * table renders in the first paint. The API route stays in place for search,
 * pagination and refreshes.
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
    searchParams: Promise<{ view?: string | string[] }>;
}) {
    const { lang } = await params;
    const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

    const ctx = await requireAdminPage("customers", locale);
    const view = parseCustomersView((await searchParams).view);

    // Mirrors the client's default state: no search, page 1, LIMIT 20.
    const [customers, telegramUpdates] = await Promise.all([
        listAdminCustomers(new URLSearchParams({ page: "1", limit: "20" })),
        view === "settings" ? readTelegramUpdatesCard() : Promise.resolve(undefined),
    ]);

    // On a read failure fall through to the client's own fetch rather than
    // rendering a misleading empty list.
    const initialData: CustomersInitialData | undefined = customers.ok
        ? { customers: { ...customers, rows: customers.rows as Customer[] } }
        : undefined;

    const canEdit = hasPermission(ctx, "customers-edit");
    return (
        <CustomersPageTabs
            initialView={view}
            canEdit={canEdit}
            canEditOnlineResult={canEdit && hasPermission(ctx, "results")}
            telegramUpdates={telegramUpdates}
        >
            <CustomersClient initialData={initialData} />
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
