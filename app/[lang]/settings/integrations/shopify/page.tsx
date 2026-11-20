import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { listShopifyAdminItems } from "@/lib/inventory/admin/shopify-items";
import ShopifyAdminPage from "./shopify-client";

export const runtime = "nodejs";

export default async function ShopifyAdminRoute({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  await requireAdminPage("shopify-link", locale);

  const items = await listShopifyAdminItems();
  return <ShopifyAdminPage initialData={items} />;
}
