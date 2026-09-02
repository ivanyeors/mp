import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { loadOrdersDashboard } from "@/lib/ecommerce/admin/orders-dashboard";
import { listAdminOrders } from "@/lib/ecommerce/admin/orders-list";
import SettingsOrdersPage, { type OrdersInitialData } from "./orders-client";

export const runtime = "nodejs";

/**
 * Server shell for the Orders admin page. Loads the dashboard summary and the
 * first page of orders (the client's default filter state: page 1, limit 20,
 * no status/date filters) so the table paints with the HTML instead of after a
 * post-hydration fetch. Later filter/paging fetches stay on the client.
 */
export default async function OrdersPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

  await requireAdminPage("orders", locale);

  const [dashboard, list] = await Promise.all([
    loadOrdersDashboard({}),
    // Mirrors the client's first-mount request: page 1, LIMIT 20, no filters.
    listAdminOrders({ page: "1", limit: "20" }),
  ]);

  const initialData: OrdersInitialData = {
    dashboard: dashboard.status === 200 ? dashboard.body : null,
    // The lib types rows structurally; the client narrows them to Order rows.
    list: list.status === 200 ? (list.body as unknown as OrdersInitialData["list"]) : null,
  };

  return <SettingsOrdersPage initialData={initialData} />;
}
