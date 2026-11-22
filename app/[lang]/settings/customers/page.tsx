import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage, type AdminContext } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { withLocale } from "@/lib/i18n/routing";
import { listAdminCustomers } from "@/lib/ecommerce/admin/customers";
import { customerFilterParams, parseCustomerFilters, searchParamsFromRecord } from "@/lib/crm/customer-filters";
import { getLifecycleSummary } from "@/lib/crm/lifecycle-summary-server";
import { getReturningCustomers } from "@/lib/crm/returning-customers-server";
import { getSiteSettings } from "@/lib/site-settings";
import { SLA_SETTING_KEYS, parseSlaSettings } from "@/lib/sla-reminders";
import { readTelegramUpdates } from "@/lib/crm/telegram-updates-server";
import { readAftercareCard } from "@/lib/aftercare/card-server";
import type { AftercareCardData } from "@/lib/aftercare/settings";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/site-url";
import { parseFollowUpScope, sgtToday, type FollowUpScope } from "@/lib/crm/followup-rules";
import { listAssignableProfiles, listFollowUps } from "@/lib/crm/followups";
import { actingProfile } from "@/lib/staff/working-as";
import { parseReviewTabScope } from "@/lib/crm/reviews";
import { listSegments } from "@/lib/crm/segments";
import { listCampaignFilterOptions } from "@/lib/email-campaigns/store";
import { CustomersClient, type CustomersInitialData } from "./customers-client";
import { CustomersPageTabs } from "./customers-page-tabs";
import type { FollowUpsFirstRead } from "./followups-tab";
import type { TelegramUpdatesCardData } from "./telegram-updates-card";
import { parseCustomersView } from "./views";

export const runtime = "nodejs";

const LIMIT = 20;

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

    const { filters, ignored } = parseCustomerFilters(searchParamsFromRecord(query));
    const first = { ...filters, page: 1, limit: LIMIT };

    const followUpScope = parseFollowUpScope(scope);
    const [customers, lifecycle, returning, segments, campaigns, telegramUpdates, aftercare, followUps] = await Promise.all([
        listAdminCustomers(customerFilterParams(first, { paging: true })),
        getLifecycleSummary(),
        getReturningCustomers(),
        listSegments().catch(() => undefined),
        listCampaignFilterOptions(supabaseAdmin(), filters.campaign ? [filters.campaign.id] : []).catch(() => []),
        view === "settings" ? readTelegramUpdatesCard() : Promise.resolve(undefined),
        view === "settings" ? readAftercareCardData() : Promise.resolve(undefined),
        view === "followups" ? readFollowUpsList(ctx, followUpScope) : Promise.resolve(undefined),
    ]);

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
            followUpScope={followUpScope}
            followUps={followUps}
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
                lifecycle={lifecycle}
                returning={returning}
                initialSegments={segments}
                campaigns={campaigns}
                canEdit={canEdit}
                canEmail={hasPermission(ctx, "campaigns")}
            />
        </CustomersPageTabs>
    );
}

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

async function readFollowUpsList(ctx: AdminContext, scope: FollowUpScope): Promise<FollowUpsFirstRead> {
    try {
        const today = sgtToday();
        const me = await actingProfile(ctx.memberId);
        const [list, assignees] = await Promise.all([
            listFollowUps({ scope, profileId: me?.id ?? null, today }),
            hasPermission(ctx, "customers-edit") ? listAssignableProfiles() : Promise.resolve([]),
        ]);
        return { scope, ...list, today, me, assignees };
    } catch (e) {
        return { error: e instanceof Error ? e.message : "Could not load follow-ups." };
    }
}

async function readAftercareCardData(): Promise<AftercareCardData | undefined> {
    try {
        return await readAftercareCard(supabaseAdmin(), { origin: getSiteOrigin() });
    } catch {
        return undefined;
    }
}
