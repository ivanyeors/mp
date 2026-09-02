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

  const items = await listOverlayMappingItems().catch(() => []);
  return <ProductBuilderPage initialData={{ ok: true, items }} />;
}
