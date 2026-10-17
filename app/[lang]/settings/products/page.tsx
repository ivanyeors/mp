import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { listAdminProducts } from "@/lib/ecommerce/admin/products";
import { getCategoryTree } from "@/lib/ecommerce/categories";
import {
    ProductsClient,
    type Category,
    type ProductRow,
    type ProductsInitialData,
} from "./products-client";

export const runtime = "nodejs";

/**
 * Products list. The two requests the client used to make on mount
 * (`GET /api/shop/products?page=1&limit=20&include_custom=true` and
 * `GET /api/shop/categories`) are read here instead, so the table renders in
 * the first paint. The API routes stay in place for search, filters,
 * pagination and post-mutation refreshes.
 */
export default async function SettingsProductsPage({
    params,
    searchParams,
}: {
    params: Promise<{ lang: string }>;
    searchParams: Promise<{ tab?: string }>;
}) {
    const [{ lang }, { tab }] = await Promise.all([params, searchParams]);
    const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

    await requireAdminPage("products", locale);

    // Mirrors the client's default state: no search, "all" status/category/type,
    // page 1, LIMIT 20. Admin list includes composed main products.
    const [products, categoryTree] = await Promise.all([
        listAdminProducts(
            new URLSearchParams({ page: "1", limit: "20", include_custom: "true" }),
        ),
        getCategoryTree(),
    ]);

    // On a read failure fall through to the client's own fetch rather than
    // rendering a misleading empty list.
    const initialData: ProductsInitialData | undefined = products.ok
        ? {
              products: { ...products, rows: products.rows as ProductRow[] },
              categories: { ok: true, rows: categoryTree as Category[] },
          }
        : undefined;

    return (
        <ProductsClient
            initialData={initialData}
            initialTab={tab === "categories" ? tab : "products"}
        />
    );
}
