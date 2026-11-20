import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { getAdminCoupon } from "@/lib/ecommerce/admin/coupons";
import { listAdminProducts } from "@/lib/ecommerce/admin/products";
import { getCategoryTree } from "@/lib/ecommerce/categories";
import {
    DiscountEditorClient,
    type CatalogCategory,
    type CatalogProduct,
    type Coupon,
    type DiscountEditorInitialData,
} from "./discount-editor-client";

export const runtime = "nodejs";

export default async function DiscountEditorPage({
    params,
}: {
    params: Promise<{ lang: string; id: string }>;
}) {
    const { lang, id } = await params;
    const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

    await requireAdminPage("discounts", locale);

    const isNew = id === "new";
    const [coupon, products, categoryTree] = await Promise.all([
        isNew ? null : getAdminCoupon(id),
        listAdminProducts(new URLSearchParams({ limit: "100" })),
        getCategoryTree(),
    ]);

    const couponLoaded = isNew || (coupon?.ok ?? false);
    const initialData: DiscountEditorInitialData | undefined =
        couponLoaded && products.ok
            ? {
                  coupon:
                      coupon?.ok === true
                          ? { ok: true, row: coupon.row as Coupon }
                          : null,
                  products: { ...products, rows: products.rows as CatalogProduct[] },
                  categories: { ok: true, rows: categoryTree as CatalogCategory[] },
              }
            : undefined;

    return <DiscountEditorClient initialData={initialData} />;
}
