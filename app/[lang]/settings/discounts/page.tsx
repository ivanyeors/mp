import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { listAdminCoupons, SHOW_BOUND_COUPONS_PARAM } from "@/lib/ecommerce/admin/coupons";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getWelcomeVoucherSummary } from "@/lib/customer-migration/welcome-voucher";
import { readWelcomeVoucherTerms, welcomeVoucherIssuing } from "@/lib/customer-migration/welcome-voucher-terms";
import {
    DiscountsClient,
    type Coupon,
    type DiscountsInitialData,
} from "./discounts-client";
import type { WelcomeVoucherCardData } from "./welcome-voucher-card";

export const runtime = "nodejs";

/**
 * Discounts list. The coupon list the client used to fetch on mount
 * (`GET /api/shop/coupons?limit=100`) is read here instead, so the table
 * renders in the first paint. The API route stays in place for refreshes and
 * mutations.
 *
 * Account-bound vouchers (each Customer's Welcome-back voucher) are left out
 * unless `?bound=show`, and the Welcome-back voucher card (migration slice 06)
 * is read here too: its terms and what the vouchers cost.
 */
export default async function SettingsDiscountsPage({
    params,
    searchParams,
}: {
    params: Promise<{ lang: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const [{ lang }, query] = await Promise.all([params, searchParams]);
    const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

    await requireAdminPage("discounts", locale);

    const showBound = query[SHOW_BOUND_COUPONS_PARAM] === "show";
    const listParams = new URLSearchParams({ limit: "100" });
    if (showBound) listParams.set(SHOW_BOUND_COUPONS_PARAM, "show");

    const [coupons, welcomeVoucher] = await Promise.all([
        listAdminCoupons(listParams),
        readWelcomeVoucherCard(),
    ]);

    // On a read failure fall through to the client's own fetch (and its error
    // handling) rather than rendering a misleading empty list.
    const initialData: DiscountsInitialData | undefined = coupons.ok
        ? { coupons: { ...coupons, rows: coupons.rows as Coupon[] } }
        : undefined;

    return (
        <DiscountsClient
            initialData={initialData}
            initialShowBound={showBound}
            welcomeVoucher={welcomeVoucher}
        />
    );
}

/** The card's data, or undefined so the card fetches it and says why it failed. */
async function readWelcomeVoucherCard(): Promise<WelcomeVoucherCardData | undefined> {
    try {
        const admin = supabaseAdmin();
        const [parsed, summary] = await Promise.all([
            readWelcomeVoucherTerms(admin),
            getWelcomeVoucherSummary(admin),
        ]);
        return { ...parsed, issuing: welcomeVoucherIssuing(parsed), summary };
    } catch {
        return undefined;
    }
}
