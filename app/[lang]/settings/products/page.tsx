import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { listAdminProducts } from "@/lib/ecommerce/admin/products";
import { getCategoryTree } from "@/lib/ecommerce/categories";
import { stripeMode } from "@/lib/stripe/mode";
import {
    ProductsClient,
    type Category,
    type ProductRow,
    type ProductsInitialData,
} from "./products-client";

export const runtime = "nodejs";

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

    const [products, categoryTree] = await Promise.all([
        listAdminProducts(
            new URLSearchParams({ page: "1", limit: "20", include_custom: "true" }),
        ),
        getCategoryTree(),
    ]);

    const initialData: ProductsInitialData | undefined = products.ok
        ? { products: { ...products, rows: products.rows as ProductRow[] } }
        : undefined;

    return (
        <ProductsClient
            initialData={initialData}
            categories={categoryTree as Category[]}
            initialTab={tab === "categories" || tab === "shop" ? tab : "products"}
            stripeMode={stripeMode()}
        />
    );
}
