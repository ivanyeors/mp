import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { listAdminCoupons } from "@/lib/ecommerce/admin/coupons";
import {
    DiscountsClient,
    type Coupon,
    type DiscountsInitialData,
} from "./discounts-client";

export const runtime = "nodejs";

export default async function SettingsDiscountsPage({
    params,
}: {
    params: Promise<{ lang: string }>;
}) {
    const { lang } = await params;
    const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

    await requireAdminPage("discounts", locale);

    const coupons = await listAdminCoupons(new URLSearchParams({ limit: "100" }));

    const initialData: DiscountsInitialData | undefined = coupons.ok
        ? { coupons: { ...coupons, rows: coupons.rows as Coupon[] } }
        : undefined;

    return <DiscountsClient initialData={initialData} />;
}
