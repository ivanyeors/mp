import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { readAiWritingAvailability } from "@/lib/ai/page-availability";
import { getAdminProduct } from "@/lib/ecommerce/admin/products";
import { getCategoryTree } from "@/lib/ecommerce/categories";
import { stripeMode } from "@/lib/stripe/mode";
import {
    ProductEditorClient,
    type LoadedProduct,
    type ProductEditorInitialData,
} from "./product-editor-client";

export const runtime = "nodejs";

export default async function ProductEditorPage({
    params,
}: {
    params: Promise<{ lang: string; id: string }>;
}) {
    const { lang, id } = await params;
    const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

    await requireAdminPage("products", locale);

    const isNew = id === "new";
    const [product, categoryTree, ai] = await Promise.all([
        isNew ? null : getAdminProduct(id),
        getCategoryTree(),
        readAiWritingAvailability(),
    ]);

    const initialData: ProductEditorInitialData | undefined =
        product?.ok
            ? {
                  product: { ok: true, row: product.row as LoadedProduct },
              }
            : undefined;

    return (
        <ProductEditorClient
            initialData={initialData}
            categories={categoryTree}
            ai={ai}
            stripeMode={stripeMode()}
        />
    );
}
