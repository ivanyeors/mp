import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import {
  loadAdminOrderDetail,
  loadAdminOrderMpConfigLinks,
  loadAdminOrderTimeline,
} from "@/lib/ecommerce/admin/order-detail";
import OrderDetailPage, { type OrderDetailInitialData } from "./order-detail-client";

export const runtime = "nodejs";

/**
 * Server shell for the order detail page. The order (with items + margin), its
 * timeline and its linked mp-config responses were three post-hydration
 * fetches; they now resolve concurrently during the server render.
 */
export default async function OrderDetailRoute({
  params,
}: {
  params: Promise<{ lang: string; id: string }>;
}) {
  const { lang, id } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

  await requireAdminPage("orders", locale);

  const [order, timeline, mpConfigLinks] = await Promise.all([
    loadAdminOrderDetail(id),
    loadAdminOrderTimeline(id),
    loadAdminOrderMpConfigLinks(id),
  ]);

  const initialData: OrderDetailInitialData = {
    // The lib types the row structurally; the client narrows it to Order.
    order: order.status === 200 ? (order.body as OrderDetailInitialData["order"]) : null,
    timeline:
      timeline.status === 200
        ? (timeline.body as OrderDetailInitialData["timeline"])
        : null,
    mpConfigLinks: mpConfigLinks.status === 200 ? mpConfigLinks.body : null,
  };

  return <OrderDetailPage initialData={initialData} />;
}
