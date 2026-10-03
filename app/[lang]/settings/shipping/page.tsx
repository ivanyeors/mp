import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { readShippingMethods } from "@/lib/shop/shipping-methods";
import { withLocale } from "@/lib/i18n/routing";
import { easyshipConfig } from "@/lib/shipping/easyship";
import { readEasyshipConfig } from "@/lib/easyship/store";
import { BOX_TYPES } from "@/lib/easyship/schema";
import { typeBoxes } from "@/lib/shipping/parcels";
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

  // A failed read must not look like "no shipping methods": leave `initialData`
  // undefined so the client runs its own mount fetch and surfaces the error.
  const [rows, account] = await Promise.all([
    readShippingMethods(true, null).catch(() => null),
    readEasyshipConfig().catch(() => null),
  ]);
  const mapped = typeBoxes(account?.settings);
  const couriers = {
    environment: easyshipConfig()?.environment ?? null,
    boxes: account?.settings?.boxes.length ?? null,
    unboxed: account ? BOX_TYPES.filter((t) => !mapped[t]) : [],
    href: withLocale("/settings/shipping/couriers", locale),
  };
  return <SettingsShippingPage initialData={rows ? { ok: true, rows } : undefined} couriers={couriers} />;
}
