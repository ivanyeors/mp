import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { getAdminProduct } from "@/lib/ecommerce/admin/products";
import { getCategoryTree } from "@/lib/ecommerce/categories";
import { stripeMode } from "@/lib/stripe/mode";
import {
    ProductEditorClient,
    type LoadedProduct,
    type ProductEditorInitialData,
} from "./product-editor-client";

export const runtime = "nodejs";

/**
 * Product editor. The two requests the client used to make on mount
 * (`GET /api/shop/products/[id]` and `GET /api/shop/categories`) are read here
 * instead, so the form renders populated in the first paint.
 *
 * `id === "new"` is the retired free-form creation route: the client toasts and
 * redirects, so nothing is loaded for it. A row that cannot be read is left to
 * the client's own fetch, which keeps the existing "Product not found" toast.
 */
export default async function ProductEditorPage({
    params,
}: {
    params: Promise<{ lang: string; id: string }>;
}) {
    const { lang, id } = await params;
    const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

    await requireAdminPage("products", locale);

    const isNew = id === "new";
    const [product, categoryTree] = await Promise.all([
        isNew ? null : getAdminProduct(id),
        getCategoryTree(),
    ]);

    const initialData: ProductEditorInitialData | undefined =
        product?.ok
            ? {
                  product: { ok: true, row: product.row as LoadedProduct },
                  categories: { ok: true, rows: categoryTree },
              }
            : undefined;

    // The browser cannot see STRIPE_SECRET_KEY, so it is told which account's ids
    // to read rather than left to guess.
    return <ProductEditorClient initialData={initialData} stripeMode={stripeMode()} />;
}
