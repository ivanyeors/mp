import Image from "next/image";
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

export default async function AccountOrderDetailPage({
  params,
}: {
  params: Promise<{ lang: string; orderNumber: string }>;
}) {
  const { lang, orderNumber } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

  const user = await getAuthUser();
  if (!user) redirect(withLocale("/account/login", locale));

  await linkCustomerToAuthUser(user);
  const order = await getCustomerOrderByNumber(decodeURIComponent(orderNumber));
  if (!order) notFound();

  const items = order.items ?? [];
  const address = order.shipping_address;
  const isResultOrder = isResultCustomisedOrder(items);
  const canRequestRefund =
    isResultOrder && customerRefundRequestDeniedReason(order, items) === null;
  const refundRequestStatus = order.refund_request_status ?? null;

  // Per-item RMA eligibility (ADR 0011). Same pure rule set the server insert
  // uses; alreadyReturnedQty comes from open RMAs on this order (service role).
  const admin = supabaseAdmin();
  const [alreadyReturned, settings] = await Promise.all([
    openReturnedQtyByOrder(admin, order.id),
    getSiteSettings(["rma_return_window_days"]),
  ]);
  const returnWindowDays =
    Number(settings.rma_return_window_days) || DEFAULT_RETURN_WINDOW_DAYS;
  const now = new Date();

  const rmaEligible: RmaEligibleItem[] = [];
  const rmaIneligible: RmaIneligibleItem[] = [];
  for (const item of items) {
    const r = evaluateEligibility({
      order: { delivered_at: order.delivered_at, status: order.status },
      item: { quantity: item.quantity },
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
          {order.discount_amount > 0 ? (
            <div className="flex justify-between text-green-600 dark:text-green-400">
              <span>Discount{order.coupon_code ? ` (${order.coupon_code})` : ""}</span>
              <span>-{formatOrderPrice(order.discount_amount, order.currency)}</span>
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
