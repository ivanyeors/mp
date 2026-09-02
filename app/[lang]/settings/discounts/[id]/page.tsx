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

/**
 * Discount editor. The three requests the client used to make on mount
 * (`GET /api/shop/coupons/[id]`, `GET /api/shop/products?limit=100` and
 * `GET /api/shop/categories`) are read here instead, so the form and the
 * "applies to" catalog render in the first paint.
 *
 * `id === "new"` loads no coupon (the client starts from a blank form) but
 * still gets the catalog. A coupon that cannot be read is left to the client's
 * own fetch, which keeps the existing "Failed to load coupon." state.
 */
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
        // Same request the client makes: the public catalog, first 100 rows.
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
