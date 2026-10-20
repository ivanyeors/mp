import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { getAdminCustomer } from "@/lib/ecommerce/admin/customers";
import { listCustomerNotes } from "@/lib/crm/notes";
import type { Customer } from "@/lib/types/ecommerce";
import {
    CustomerDetailClient,
    type CustomerDetailInitialData,
} from "./customer-detail-client";

export const runtime = "nodejs";

/**
 * Customer detail. The `GET /api/shop/customers/[id]` request the client used
 * to make on mount is read here instead, with the Customer's notes. The orders
 * and addresses panels keep their own fetches (`/api/shop/orders`,
 * `/api/shop/customers/[id]/addresses`), which are guarded by different
 * permissions and are outside this change.
 *
 * A missing row is handed to the client as the same `{ error }` body the route
 * returns with its 404, so the screen behaves exactly as it does today.
 */
export default async function CustomerDetailPage({
    params,
}: {
    params: Promise<{ lang: string; id: string }>;
}) {
    const { lang, id } = await params;
    const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

    const ctx = await requireAdminPage("customers", locale);

    const [customer, notes] = await Promise.all([
        getAdminCustomer(id),
        listCustomerNotes(id).catch(() => null),
    ]);

    const initialData: CustomerDetailInitialData = {
        customer: customer.ok
            ? { ok: true, row: customer.row as Customer }
            : { error: customer.error },
        notes,
    };

    return (
        <CustomerDetailClient
            initialData={initialData}
            viewer={{
                userId: ctx.userId,
                grantsAll: ctx.grantsAll,
                // customers-edit once CRM 10 lands.
                canEdit: hasPermission(ctx, "customers"),
            }}
        />
    );
}
