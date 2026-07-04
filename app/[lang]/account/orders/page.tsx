import Link from "next/link";
import { redirect } from "next/navigation";
import { Package, ExternalLink } from "lucide-react";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { getAuthUser } from "@/lib/auth/user";
import { linkCustomerToAuthUser } from "@/lib/auth/customer-identity";
import { getCustomerOrders } from "@/lib/shop/customer-orders";
import {
  formatOrderDate,
  formatOrderPrice,
  orderStatusBadgeClass,
  orderStatusLabel,
} from "@/lib/shop/order-display";

export const metadata = {
  title: "Order history",
};

export default async function AccountOrdersPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

  const user = await getAuthUser();
  if (!user) redirect(withLocale("/account/login", locale));

  // Ensure the auth user is linked to a customer so RLS can resolve their orders.
  await linkCustomerToAuthUser(user);
  const orders = await getCustomerOrders();

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Order history, status, and tracking.
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <Package className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            You don&apos;t have any orders yet.
          </p>
          <Link
            href={withLocale("/shop", locale)}
            className="text-sm font-medium text-primary hover:underline"
          >
            Start shopping
          </Link>
        </div>
      ) : (
        <ul className="space-y-4">
          {orders.map((order) => {
            const itemCount = (order.items ?? []).reduce(
              (sum, item) => sum + item.quantity,
              0,
            );
            return (
              <li key={order.id}>
                <Link
                  href={withLocale(`/account/orders/${order.order_number}`, locale)}
                  className="block rounded-lg border p-5 transition-colors hover:bg-muted/40"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-medium tracking-wide">{order.order_number}</p>
                      <p className="text-sm text-muted-foreground">
                        Placed {formatOrderDate(order.created_at)}
                        {itemCount > 0
                          ? ` · ${itemCount} item${itemCount === 1 ? "" : "s"}`
                          : ""}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${orderStatusBadgeClass(order.status)}`}
                    >
                      {orderStatusLabel(order.status)}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">
                      {formatOrderPrice(order.total, order.currency)}
                    </span>
                    {order.status === "shipped" && order.tracking_number ? (
                      <span className="inline-flex items-center text-xs text-muted-foreground">
                        Tracking: {order.tracking_number}
                      </span>
                    ) : null}
                  </div>

                  {order.status === "shipped" && order.tracking_url ? (
                    <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary">
                      Track shipment
                      <ExternalLink className="h-3 w-3" />
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
