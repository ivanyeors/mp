import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { readShippingMethods } from "@/lib/shop/shipping-methods";
import { getLocations } from "@/lib/locations";
import { withLocale } from "@/lib/i18n/routing";
import { easyshipConfig } from "@/lib/shipping/easyship";
import { readEasyshipConfig } from "@/lib/easyship/store";
import { BOX_TYPES } from "@/lib/easyship/schema";
import { typeBoxes } from "@/lib/shipping/parcels";
import SettingsShippingPage from "./shipping-client";

export const runtime = "nodejs";

export default async function ShippingSettingsRoute({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  await requireAdminPage("shipping", locale);

  const [rows, account, ownLocations] = await Promise.all([
    readShippingMethods(true, null).catch(() => null),
    readEasyshipConfig().catch(() => null),
    getLocations({ type: "own" }),
  ]);
  const studios = ownLocations
    .filter((l) => l.address?.trim())
    .map((l) => ({ id: l.id, name: l.name }));
  const mapped = typeBoxes(account?.settings);
  const unboxed = account?.settings ? BOX_TYPES.filter((t) => !mapped[t]) : [];
  const couriers = {
    environment: easyshipConfig()?.environment ?? null,
    boxes: account?.settings?.boxes.length ?? null,
    unboxed,
    unreadable: account ? account.settingsError ?? null : "The courier settings could not be loaded",
    href: withLocale(`/settings/shipping/couriers${unboxed.length ? "?tab=boxes" : ""}`, locale),
  };
  return (
    <SettingsShippingPage
      initialData={rows ? { ok: true, rows } : undefined}
      couriers={couriers}
      studios={studios}
    />
  );
}
