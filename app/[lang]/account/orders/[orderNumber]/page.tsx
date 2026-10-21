import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ExternalLink, Package, Truck } from "lucide-react";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { getAuthUser } from "@/lib/auth/user";
import { linkCustomerToAuthUser } from "@/lib/auth/customer-identity";
import { getCustomerOrderByNumber } from "@/lib/shop/customer-orders";
import {
  formatOrderDate,
  formatOrderPrice,
  orderStatusBadgeClass,
  orderStatusLabel,
} from "@/lib/shop/order-display";
import {
  customerRefundRequestDeniedReason,
  isPostDelivery,
  isResultCustomisedOrder,
} from "@/lib/results/post-delivery-refund";
import { supabaseAdmin } from "@/lib/supabase/server";
import { orderEarnLine, pointsUsedRow, readOrderPoints } from "@/lib/points/order";
import { getSiteSettings } from "@/lib/site-settings";
import {
  evaluateEligibility,
  DEFAULT_RETURN_WINDOW_DAYS,
} from "@/lib/rma/eligibility";
import { openReturnedQtyByOrder } from "@/lib/rma/create";
import {
  OrderRmaActions,
  type RmaEligibleItem,
  type RmaIneligibleItem,
} from "./rma-actions";
import { OrderRefundActions } from "./refund-actions";
import { getMessages } from "@/lib/i18n/messages";
import type { ReadjustmentQuote } from "@/lib/readjustment/eligibility";
import { quoteBadge } from "@/lib/readjustment/format";
import { loadReadjustmentContext } from "@/lib/readjustment/purchases";

export default async function AccountOrderDetailPage({
  params,
}: {
  params: Promise<{ lang: string; orderNumber: string }>;
}) {
  const { lang, orderNumber } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

  const user = await getAuthUser();
  if (!user) redirect(withLocale("/account/login", locale));

  const customer = await linkCustomerToAuthUser(user);
  const order = await getCustomerOrderByNumber(decodeURIComponent(orderNumber));
  if (!order) notFound();

  const items = order.items ?? [];

  // Re-adjustment (ADR 0024): each pillow or bolster line can start a booking,
  // with the same server quote the booking page shows; a line with one coming up
  // shows it instead. Best-effort — the order page never fails on this.
  const readjustT = getMessages(locale).slides.bookAppointment.readjust;
  const [readjustCtx, upcoming] = await Promise.all([
    loadReadjustmentContext(supabaseAdmin(), customer.id).catch(() => null),
    (async () => {
      const { data } = await supabaseAdmin()
        .from("readjustment_bookings")
        .select("order_item_id, start_at, location_name")
        .eq("customer_id", customer.id)
        .eq("status", "booked")
        .gt("start_at", new Date().toISOString())
        .in("order_item_id", items.map((i) => i.id))
        .order("start_at", { ascending: true });
      return data ?? [];
    })().catch(() => []),
  ]);
  const quoteByItem = new Map<string, ReadjustmentQuote>(
    (readjustCtx?.purchases ?? []).map((p) => [p.orderItemId, p.quote] as const),
  );
  const upcomingByItem = new Map<string, { start_at: string; location_name: string }>();
  for (const b of upcoming) {
    if (b.order_item_id && !upcomingByItem.has(b.order_item_id as string)) {
      upcomingByItem.set(b.order_item_id as string, { start_at: b.start_at as string, location_name: b.location_name as string });
    }
  }
  const visitLabel = (iso: string) =>
    new Intl.DateTimeFormat(locale === "zh-CN" ? "zh-CN" : "en-SG", {
      timeZone: "Asia/Singapore",
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  const address = order.shipping_address;
  const isResultOrder = isResultCustomisedOrder(items);
  const canRequestRefund =
    isResultOrder && customerRefundRequestDeniedReason(order, items) === null;
  const refundRequestStatus = order.refund_request_status ?? null;

  // Per-item RMA eligibility (ADR 0011). Same pure rule set the server insert
  // uses; alreadyReturnedQty comes from open RMAs on this order (service role).
  const admin = supabaseAdmin();
  // Points (PRD-loyalty-points slices 03, 04): what the order spent and what
  // it earns. A failed read only leaves the lines out.
  const [alreadyReturned, settings, points] = await Promise.all([
    openReturnedQtyByOrder(admin, order.id),
    getSiteSettings(["rma_return_window_days"]),
    readOrderPoints(admin, order).catch(() => null),
  ]);
  const pointsUsed = pointsUsedRow(Number(order.points_spent ?? 0));
  const couponDiscount = Math.round((order.discount_amount - (pointsUsed?.dollars ?? 0)) * 100) / 100;
  const returnWindowDays =
    Number(settings.rma_return_window_days) || DEFAULT_RETURN_WINDOW_DAYS;
  const now = new Date();

  const rmaEligible: RmaEligibleItem[] = [];
  const rmaIneligible: RmaIneligibleItem[] = [];
  for (const item of items) {
    const r = evaluateEligibility({
      order: { delivered_at: order.delivered_at, status: order.status },
      item: { quantity: item.quantity, kind: item.kind },
      alreadyReturnedQty: alreadyReturned[item.id] ?? 0,
      returnWindowDays,
      now,
    });
    if (r.eligible) {
      rmaEligible.push({
        id: item.id,
        title: item.product_title,
        availableQty: r.availableQty,
      });
    } else {
      rmaIneligible.push({
        id: item.id,
        title: item.product_title,
        reason: r.reason ?? "This item cannot be returned.",
      });
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Order {order.order_number}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Placed {formatOrderDate(order.created_at)}
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${orderStatusBadgeClass(order.status)}`}
        >
          {orderStatusLabel(order.status)}
        </span>
      </div>

      {/* Tracking */}
      {order.status === "shipped" && order.tracking_number ? (
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="flex items-start gap-3">
            <Truck className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-sm font-medium">Your order is on its way</p>
              {order.shipping_courier ? (
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Courier:{" "}
                  <span className="font-medium text-foreground">{order.shipping_courier}</span>
                </p>
              ) : null}
              <p className="mt-0.5 text-sm text-muted-foreground">
                Tracking number:{" "}
                <span className="font-medium text-foreground">
                  {order.tracking_number}
                </span>
              </p>
              {order.shipping_tracking_status ? (
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Latest update:{" "}
                  <span className="font-medium text-foreground">{order.shipping_tracking_status}</span>
                </p>
              ) : null}
              {order.tracking_url ? (
                <a
                  href={order.tracking_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  Track shipment
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Items */}
      <section className="rounded-lg border">
        <div className="divide-y">
          {items.map((item) => (
            <div key={item.id} className="flex gap-4 p-4">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-muted">
                {item.image_url ? (
                  <Image
                    src={item.image_url}
                    alt={item.product_title}
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Package className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="flex flex-1 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-tight">
                    {item.product_title}
                  </p>
                  {item.variant_title ? (
                    <p className="text-xs text-muted-foreground">
                      {item.variant_title}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Qty {item.quantity}
                  </p>
                  {upcomingByItem.has(item.id) ? (
                    <p className="mt-2 text-xs font-medium text-primary">
                      Re-adjustment booked · {visitLabel(upcomingByItem.get(item.id)!.start_at)} ·{" "}
                      {upcomingByItem.get(item.id)!.location_name}
                    </p>
                  ) : quoteByItem.has(item.id) ? (
                    <Link
                      href={withLocale(
                        `/appointments?type=readjustment&item=${encodeURIComponent(item.id)}`,
                        locale,
                      )}
                      className="mt-2 inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-primary hover:underline"
                    >
                      Book a re-adjustment
                      <span className="rounded-full border px-2 py-0.5 font-normal text-muted-foreground">
                        {quoteBadge(quoteByItem.get(item.id)!, readjustT, locale)}
                      </span>
                    </Link>
                  ) : null}
                </div>
                <p className="shrink-0 text-sm font-medium">
                  {formatOrderPrice(item.total_price, order.currency)}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="space-y-1.5 border-t p-4 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>{formatOrderPrice(order.subtotal, order.currency)}</span>
          </div>
          {order.shipping_amount > 0 ? (
            <div className="flex justify-between text-muted-foreground">
              <span>Shipping</span>
              <span>{formatOrderPrice(order.shipping_amount, order.currency)}</span>
            </div>
          ) : null}
          {couponDiscount > 0 ? (
            <div className="flex justify-between text-green-600 dark:text-green-400">
              <span>Discount{order.coupon_code ? ` (${order.coupon_code})` : ""}</span>
              <span>-{formatOrderPrice(couponDiscount, order.currency)}</span>
            </div>
          ) : null}
          {pointsUsed ? (
            <div className="flex justify-between text-green-600 dark:text-green-400">
              <span>{pointsUsed.label}</span>
              <span>-{formatOrderPrice(pointsUsed.dollars, order.currency)}</span>
            </div>
          ) : null}
          {order.tax_amount > 0 ? (
            <div className="flex justify-between text-muted-foreground">
              <span>Tax</span>
              <span>{formatOrderPrice(order.tax_amount, order.currency)}</span>
            </div>
          ) : null}
          <div className="mt-1 flex justify-between border-t pt-2 text-base font-semibold">
            <span>Total</span>
            <span>{formatOrderPrice(order.total, order.currency)}</span>
          </div>
          {points?.earn ? <p className="pt-1 text-muted-foreground">{orderEarnLine(points.earn)}</p> : null}
        </div>
      </section>

      {isResultOrder && !isPostDelivery(order) && !refundRequestStatus ? (
        <div className="rounded-lg border p-4 text-sm text-muted-foreground">
          This customised order cannot be cancelled after Accept. You can request a
          refund after delivery if you return the product in person.
        </div>
      ) : null}
      {isResultOrder ? (
        <OrderRefundActions
          orderNumber={order.order_number}
          canRequest={canRequestRefund}
          requestStatus={refundRequestStatus}
        />
      ) : null}

      {rmaEligible.length > 0 || rmaIneligible.length > 0 ? (
        <OrderRmaActions
          orderNumber={order.order_number}
          eligibleItems={rmaEligible}
          ineligibleItems={rmaIneligible}
        />
      ) : null}

      {/* Shipping address */}
      {address ? (
        <section className="rounded-lg border p-4">
          <h2 className="text-sm font-medium">Shipping address</h2>
          <address className="mt-2 text-sm not-italic leading-relaxed text-muted-foreground">
            {address.recipient}
            <br />
            {address.line1}
            {address.line2 ? (
              <>
                <br />
                {address.line2}
              </>
            ) : null}
            <br />
            {[address.city, address.state, address.postal_code]
              .filter(Boolean)
              .join(", ")}
            <br />
            {address.country}
          </address>
        </section>
      ) : null}
    </div>
  );
}
