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
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Customer } from "@/lib/types/ecommerce";
import {
    CustomerDetailClient,
    type CustomerDetailInitialData,
} from "./customer-detail-client";

export const runtime = "nodejs";

/**
 * Customer detail. The `GET /api/shop/customers/[id]` request the client used
 * to make on mount is read here instead, with the Customer's notes and what the
 * Shopify import holds for them (the From Shopify card, migration slice 12).
 * The **Lifecycle stage** (PRD-crm-retention-loop slice 03) is read from the
 * overview, and a failed read only leaves it out. So are the Customer's
 * **Fitting records** (ADR 0042), whose card says when they could not be read,
 * and their pillow (ADR 0042 j): a Staff link, else the latest fitting's
 * configuration type matched to its Filling Template, drawn in the x-ray.
 * The Contact and sign-in card (CRM slice 11) reads the customer row itself;
 * what is matched by phone (WhatsApp, the other numbers seen) is read here
 * once the row's number is known. The orders
 * and addresses panels keep their own fetches (`/api/shop/orders`,
 * `/api/shop/customers/[id]/addresses`), which are guarded by different
 * permissions and are outside this change.
 *
 * A missing row is handed to the client as the same `{ error }` body the route
 * returns with its 404, so the screen behaves exactly as it does today.
 *
 * Seeing this page needs `customers`; its edit controls render only for
 * `customers-edit` (CRM slice 10). The write routes refuse without it anyway.
 * Create order (a Staff order, ADR 0048) renders only for `orders`, which its
 * routes require.
 */
export default async function CustomerDetailPage({
    params,
}: {
    params: Promise<{ lang: string; id: string }>;
}) {
    const { lang, id } = await params;
    const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

    const ctx = await requireAdminPage("customers", locale);

    const [customer, notes, migration, lifecycle, fittings, unsubscribeReason, next] = await Promise.all([
        getAdminCustomer(id),
        listCustomerNotes(id).catch(() => null),
        getMigratedCustomer(id),
        getAdminCustomerLifecycle(id).catch(() => null),
        listCustomerFittings(id).catch(() => null),
        // PRD-crm-retention-loop slice 11: why a Lost Customer unsubscribed, beside the stage.
        readCustomerUnsubscribeReason(supabaseAdmin(), id).catch(() => null),
        // Slice 05: the next step, a summary that never fails the page.
        readNextStepFacts(supabaseAdmin(), id)
            .then((facts) => (facts ? nextStep(facts, new Date()) : null))
            .catch(() => null),
    ]);

    // Both need what the reads above returned; neither waits for the other.
    // The third: how they found us (their first Visit's Entry source), read
    // from journey analytics; their own answer only with `results`.
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
    };

    return (
        <CustomerDetailClient
            initialData={initialData}
            canEdit={hasPermission(ctx, "customers-edit")}
            canImport={hasPermission(ctx, "customer-import")}
            canCreateOrder={hasPermission(ctx, "orders")}
            viewer={{ userId: ctx.userId, grantsAll: ctx.grantsAll }}
        />
    );
}

/** The pillow, read after the fittings it is matched from. A failed read says so on the card. */
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

/**
 * WhatsApp and the other numbers seen (CRM slice 11). Numbers from bookings
 * and from Results are each read only with that source's own permission
 * (ADR 0028 (b)). A failed read says so on the card and never fails the page.
 */
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
