import Link from "next/link";
import { redirect } from "next/navigation";
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
import { Button } from "@/components/ui/button";

export default async function AccountHomePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

  const user = await getAuthUser();
  if (!user) redirect(withLocale("/account/login", locale));

  // First sign-in links (or creates) the customer record for this auth user.
  const customer = await linkCustomerToAuthUser(user);
  const displayName =
    [customer.first_name, customer.last_name].filter(Boolean).join(" ") || customer.email;

  const ordersHref = withLocale("/account/orders", locale);
  const addressesHref = withLocale("/account/addresses", locale);

  const recentOrders = (await getCustomerOrders()).slice(0, 3);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 md:py-16">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">My account</h1>
          <p className="text-sm text-muted-foreground">Signed in as {displayName}</p>
        </div>
        <form action={`/auth/signout?next=${encodeURIComponent(withLocale("/", locale))}`} method="post">
          <Button type="submit" variant="outline" size="sm">
            Sign out
          </Button>
        </form>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link
          href={ordersHref}
          className="rounded-lg border p-5 transition-colors hover:bg-muted/40"
        >
          <h2 className="font-medium">Orders</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            View your order history, status, and tracking.
          </p>
        </Link>
        <Link
          href={withLocale("/results", locale)}
          className="rounded-lg border p-5 transition-colors hover:bg-muted/40"
        >
          <h2 className="font-medium">Results</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Track customisation reviews and authorization holds.
          </p>
        </Link>
        <Link
          href={addressesHref}
          className="rounded-lg border p-5 transition-colors hover:bg-muted/40"
        >
          <h2 className="font-medium">Addresses</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your saved shipping addresses.
          </p>
        </Link>
      </div>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Recent orders</h2>
          {recentOrders.length > 0 ? (
            <Link
              href={ordersHref}
              className="text-sm font-medium text-primary hover:underline"
            >
              View all
            </Link>
          ) : null}
        </div>

        {recentOrders.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            You don&apos;t have any orders yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {recentOrders.map((order) => (
              <li key={order.id}>
                <Link
                  href={withLocale(`/account/orders/${order.order_number}`, locale)}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/40"
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium tracking-wide">
                      {order.order_number}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatOrderDate(order.created_at)} ·{" "}
                      {formatOrderPrice(order.total, order.currency)}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${orderStatusBadgeClass(order.status)}`}
                  >
                    {orderStatusLabel(order.status)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
