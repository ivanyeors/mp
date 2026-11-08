import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import {
  loadAdminOrderDetail,
  loadAdminOrderMpConfigLinks,
  loadAdminOrderTimeline,
} from "@/lib/ecommerce/admin/order-detail";
import { readOrderPoints, type OrderPointsRow } from "@/lib/points/order";
import { supabaseAdmin } from "@/lib/supabase/server";
import { loadPayLinkRow } from "@/lib/staff-orders/link";
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

  const [order, timeline, mpConfigLinks, payLink] = await Promise.all([
    loadAdminOrderDetail(id),
    loadAdminOrderTimeline(id),
    loadAdminOrderMpConfigLinks(id),
    // A Staff order's Payment link (ADR 0048); null for any other Order or a failed read.
    loadPayLinkRow(supabaseAdmin(), id).catch(() => null),
  ]);

  const orderBody = order.status === 200 ? (order.body as OrderDetailInitialData["order"]) : null;
  // What the order earns (PRD-loyalty-points slice 03). A failed read only
  // leaves the line out.
  const points = orderBody
    ? await readOrderPoints(supabaseAdmin(), orderBody.row as unknown as OrderPointsRow).catch(() => null)
    : null;

  const initialData: OrderDetailInitialData = {
    // The lib types the row structurally; the client narrows it to Order.
    order: orderBody,
    pointsEarn: points?.earn ?? null,
    timeline:
      timeline.status === 200
        ? (timeline.body as OrderDetailInitialData["timeline"])
        : null,
    mpConfigLinks: mpConfigLinks.status === 200 ? mpConfigLinks.body : null,
    paymentLink: payLink
      ? {
          token: payLink.token,
          expiresAt: payLink.expires_at,
          createdByEmail: payLink.created_by_email,
          lastSentAt: payLink.last_sent_at,
          lastSentTo: payLink.last_sent_to,
          sendCount: payLink.send_count ?? 0,
          locale: String(orderBody?.row?.locale ?? ""),
        }
      : null,
  };

  return <OrderDetailPage initialData={initialData} />;
}
