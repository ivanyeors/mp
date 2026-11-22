import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { loadOrdersDashboard } from "@/lib/ecommerce/admin/orders-dashboard";
import { listAdminOrders } from "@/lib/ecommerce/admin/orders-list";
import SettingsOrdersPage, { type OrdersInitialData } from "./orders-client";

export const runtime = "nodejs";

export default async function OrdersPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

  const ctx = await requireAdminPage("orders", locale);
  const canSeeCost = hasPermission(ctx, "costings");

  const [dashboard, list] = await Promise.all([
    loadOrdersDashboard({}, { canSeeCost }),
    listAdminOrders({ page: "1", limit: "20" }, { canSeeCost }),
  ]);

  const initialData: OrdersInitialData = {
    dashboard: dashboard.status === 200 ? dashboard.body : null,
    list: list.status === 200 ? (list.body as unknown as OrdersInitialData["list"]) : null,
  };

  return <SettingsOrdersPage initialData={initialData} canSeeCost={canSeeCost} />;
}
