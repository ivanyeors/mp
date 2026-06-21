import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, ExternalLink, Package, Truck } from "lucide-react";
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

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 md:py-16">
      <div className="space-y-1">
        <Link
          href={withLocale("/account/orders", locale)}
          className="inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Order history
        </Link>
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
      </div>

      {/* Tracking */}
      {order.status === "shipped" && order.tracking_number ? (
        <div className="mt-6 rounded-lg border bg-muted/30 p-4">
          <div className="flex items-start gap-3">
            <Truck className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-sm font-medium">Your order is on its way</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Tracking number:{" "}
                <span className="font-medium text-foreground">
                  {order.tracking_number}
                </span>
              </p>
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
      <section className="mt-8 rounded-lg border">
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

      {/* Shipping address */}
      {address ? (
        <section className="mt-6 rounded-lg border p-4">
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
    </main>
  );
}
