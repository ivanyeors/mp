import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage, type AdminContext } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { readCustomerUnsubscribeReason } from "@/lib/marketing-consent/unsubscribe-reasons-server";
import { nextStep } from "@/lib/crm/next-step";
import { readNextStepFacts } from "@/lib/crm/next-step-server";
import { getAdminCustomer, getAdminCustomerLifecycle } from "@/lib/ecommerce/admin/customers";
import { listCustomerNotes } from "@/lib/crm/notes";
import { getMigratedCustomer } from "@/lib/customer-migration/overview";
import { listCustomerFittings } from "@/lib/fitting-import/records";
import { loadCustomerPillow } from "@/lib/customer-pillow/load";
import type { CustomerPillowResult } from "@/lib/customer-pillow/view";
import { readContactFacts } from "@/lib/crm/contact-facts";
import type { ContactFactsResult } from "@/lib/crm/contact-status";
import { readCustomerEntry } from "@/lib/crm/customer-entry";
import { readCustomerReviews } from "@/lib/crm/google-review-match-server";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Customer, CustomerAddress } from "@/lib/types/ecommerce";
import { parseCustomerTab } from "@/lib/crm/customer-tabs";
import {
    CustomerDetailClient,
    type CustomerDetailInitialData,
} from "./customer-detail-client";

export const runtime = "nodejs";

export default async function CustomerDetailPage({
    params,
    searchParams,
}: {
    params: Promise<{ lang: string; id: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const [{ lang, id }, query] = await Promise.all([params, searchParams]);
    const tabParam = Array.isArray(query.tab) ? query.tab[0] : query.tab;
    const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

    const ctx = await requireAdminPage("customers", locale);

    const [customer, notes, migration, lifecycle, fittings, unsubscribeReason, next, reviews] = await Promise.all([
        getAdminCustomer(id),
        listCustomerNotes(id).catch(() => null),
        getMigratedCustomer(id),
        getAdminCustomerLifecycle(id).catch(() => null),
        listCustomerFittings(id).catch(() => null),
        readCustomerUnsubscribeReason(supabaseAdmin(), id).catch(() => null),
        readNextStepFacts(supabaseAdmin(), id)
            .then((facts) => (facts ? nextStep(facts, new Date()) : null))
            .catch(() => null),
        readCustomerReviews(supabaseAdmin(), id).catch(() => null),
    ]);

    const [pillow, contact, entry] = customer.ok
        ? await Promise.all([
              readPillow(id, fittings),
              readContact(customer.row as Customer, ctx),
              readCustomerEntry(supabaseAdmin(), customer.row as Customer, { results: hasPermission(ctx, "results") }),
          ])
        : [undefined, undefined, undefined];

    const initialData: CustomerDetailInitialData = {
        customer: customer.ok
            ? { ok: true, row: customer.row as Customer }
            : { error: customer.error },
        notes,
        migration,
        lifecycle,
        unsubscribeReason,
        nextStep: next,
        fittings,
        pillow,
        contact,
        entry,
        addresses: customer.ok ? ((customer.row as { customer_addresses?: CustomerAddress[] }).customer_addresses ?? []) : [],
        reviews,
    };

    return (
        <CustomerDetailClient
            initialData={initialData}
            canEdit={hasPermission(ctx, "customers-edit")}
            canImport={hasPermission(ctx, "customer-import")}
            canCreateOrder={hasPermission(ctx, "orders")}
            viewer={{ userId: ctx.userId, grantsAll: ctx.grantsAll }}
            initialTab={parseCustomerTab(tabParam)}
        />
    );
}

async function readPillow(
    customerId: string,
    fittings: Awaited<ReturnType<typeof listCustomerFittings>> | null,
): Promise<CustomerPillowResult> {
    try {
        const loaded = await loadCustomerPillow(supabaseAdmin(), customerId, fittings ?? []);
        return loaded.ok ? loaded.pillow : null;
    } catch {
        return null;
    }
}

async function readContact(row: Customer, ctx: AdminContext): Promise<ContactFactsResult> {
    try {
        const facts = await readContactFacts(supabaseAdmin(), row, {
            bookings: hasPermission(ctx, "appointments"),
            results: hasPermission(ctx, "results"),
        });
        return { ok: true, facts };
    } catch {
        return { ok: false };
    }
}
