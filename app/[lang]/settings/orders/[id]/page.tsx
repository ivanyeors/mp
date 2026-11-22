import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
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

export default async function OrderDetailRoute({
  params,
}: {
  params: Promise<{ lang: string; id: string }>;
}) {
  const { lang, id } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

  const ctx = await requireAdminPage("orders", locale);

  const [order, timeline, mpConfigLinks, payLink] = await Promise.all([
    loadAdminOrderDetail(id, { canSeeCost: hasPermission(ctx, "costings") }),
    loadAdminOrderTimeline(id),
    loadAdminOrderMpConfigLinks(id),
    loadPayLinkRow(supabaseAdmin(), id).catch(() => null),
  ]);

  const orderBody = order.status === 200 ? (order.body as OrderDetailInitialData["order"]) : null;
  const points = orderBody
    ? await readOrderPoints(supabaseAdmin(), orderBody.row as unknown as OrderPointsRow).catch(() => null)
    : null;

  const initialData: OrderDetailInitialData = {
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
