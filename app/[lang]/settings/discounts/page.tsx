import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { listAdminCoupons } from "@/lib/ecommerce/admin/coupons";
import {
    DiscountsClient,
    type Coupon,
    type DiscountsInitialData,
} from "./discounts-client";

export const runtime = "nodejs";

/**
 * Discounts list. The coupon list the client used to fetch on mount
 * (`GET /api/shop/coupons?limit=100`) is read here instead, so the table
 * renders in the first paint. The API route stays in place for refreshes and
 * mutations.
 */
export default async function SettingsDiscountsPage({
    params,
}: {
    params: Promise<{ lang: string }>;
}) {
    const { lang } = await params;
    const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

    await requireAdminPage("discounts", locale);

    const coupons = await listAdminCoupons(new URLSearchParams({ limit: "100" }));

    // On a read failure fall through to the client's own fetch (and its error
    // handling) rather than rendering a misleading empty list.
    const initialData: DiscountsInitialData | undefined = coupons.ok
        ? { coupons: { ...coupons, rows: coupons.rows as Coupon[] } }
        : undefined;

    return <DiscountsClient initialData={initialData} />;
}
