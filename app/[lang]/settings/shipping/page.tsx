import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { readShippingMethods } from "@/lib/shop/shipping-methods";
import SettingsShippingPage from "./shipping-client";

export const runtime = "nodejs";

/**
 * The methods come from the same `shipping-methods`-tagged read that backs
 * `/api/shop/shipping`; the page guard already proves the `shipping`
 * permission, so inactive rows are included just as `include_inactive=1` does.
 */
export default async function ShippingSettingsRoute({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  await requireAdminPage("shipping", locale);

  const rows = await readShippingMethods(true, null).catch(() => []);
  return <SettingsShippingPage initialData={{ ok: true, rows }} />;
}
