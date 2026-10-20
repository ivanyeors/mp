import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { withLocale } from "@/lib/i18n/routing";
import { listAdminCustomers } from "@/lib/ecommerce/admin/customers";
import { getSiteSettings } from "@/lib/site-settings";
import { SLA_SETTING_KEYS, parseSlaSettings } from "@/lib/sla-reminders";
import { readTelegramUpdates } from "@/lib/crm/telegram-updates-server";
import { readAftercareCard } from "@/lib/aftercare/card-server";
import type { AftercareCardData } from "@/lib/aftercare/settings";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/site-url";
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
    searchParams: Promise<{ view?: string | string[] }>;
}) {
    const { lang } = await params;
    const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

    const ctx = await requireAdminPage("customers", locale);
    const view = parseCustomersView((await searchParams).view);

    // Mirrors the client's default state: no search, page 1, LIMIT 20.
    const [customers, telegramUpdates, aftercare] = await Promise.all([
        listAdminCustomers(new URLSearchParams({ page: "1", limit: "20" })),
        view === "settings" ? readTelegramUpdatesCard() : Promise.resolve(undefined),
        view === "settings" ? readAftercareCardData() : Promise.resolve(undefined),
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
            aftercare={aftercare}
            importHref={
                hasPermission(ctx, "customer-import")
                    ? withLocale("/settings/customers/import", locale)
                    : undefined
            }
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

/** The Aftercare card's data, or undefined so the card fetches it and says why. */
async function readAftercareCardData(): Promise<AftercareCardData | undefined> {
    try {
        return await readAftercareCard(supabaseAdmin(), { origin: getSiteOrigin() });
    } catch {
        return undefined;
    }
}
