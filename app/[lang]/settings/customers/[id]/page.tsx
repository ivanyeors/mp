import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage, type AdminContext } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { getAdminCustomer, getAdminCustomerLifecycle } from "@/lib/ecommerce/admin/customers";
import { listCustomerNotes } from "@/lib/crm/notes";
import { getMigratedCustomer } from "@/lib/customer-migration/overview";
import { listCustomerFittings } from "@/lib/fitting-import/records";
import { readContactFacts } from "@/lib/crm/contact-facts";
import type { ContactFactsResult } from "@/lib/crm/contact-status";
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
 * **Fitting records** (ADR 0042), whose card says when they could not be read.
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
 */
export default async function CustomerDetailPage({
    params,
}: {
    params: Promise<{ lang: string; id: string }>;
}) {
    const { lang, id } = await params;
    const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

    const ctx = await requireAdminPage("customers", locale);

    const [customer, notes, migration, lifecycle, fittings] = await Promise.all([
        getAdminCustomer(id),
        listCustomerNotes(id).catch(() => null),
        getMigratedCustomer(id),
        getAdminCustomerLifecycle(id).catch(() => null),
        listCustomerFittings(id).catch(() => null),
    ]);

    const initialData: CustomerDetailInitialData = {
        customer: customer.ok
            ? { ok: true, row: customer.row as Customer }
            : { error: customer.error },
        notes,
        migration,
        lifecycle,
        fittings,
        contact: customer.ok ? await readContact(customer.row as Customer, ctx) : undefined,
    };

    return (
        <CustomerDetailClient
            initialData={initialData}
            canEdit={hasPermission(ctx, "customers-edit")}
            canImport={hasPermission(ctx, "customer-import")}
            viewer={{ userId: ctx.userId, grantsAll: ctx.grantsAll }}
        />
    );
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
