import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { listOverlayMappingItems } from "@/lib/product-builder/overlay-mappings";
import ProductBuilderPage from "./product-builder-client";

export const runtime = "nodejs";

/**
 * Overlay mappings are assembled on the server (the same payload
 * `/settings/product-builder/mappings` returns) so the table mounts filled.
 * Filling visuals still load from their own endpoint on the client.
 */
export default async function ProductBuilderRoute({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  await requireAdminPage("page-builder", locale);

  // A failed read must not look like "no mappings": leave `initialData`
  // undefined so the client runs its own mount fetch and surfaces the error.
  const items = await listOverlayMappingItems().catch(() => null);
  return <ProductBuilderPage initialData={items ? { ok: true, items } : undefined} />;
}
