import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Clock, MapPin, Truck } from "lucide-react";

import { ConfirmingRefresh } from "@/components/slide-in-pages/confirming-refresh";
import { Button } from "@/components/ui/button";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { getMessages } from "@/lib/i18n/messages";
import { withLocale } from "@/lib/i18n/routing";
import { collectLocationOf } from "@/lib/shipping/self-collect";
import { loadPayLinkByToken, type LoadedPayLink } from "@/lib/staff-orders/link";
import { isPayLinkToken, payLinkState } from "@/lib/staff-orders/shared";
import { supabaseAdmin } from "@/lib/supabase/server";
import { PayButton } from "./pay-button";

export const metadata: Metadata = { title: "Pay your order", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * A Staff order's Payment link (ADR 0048), opened on the customer's own
 * device. Read fresh on every render: what is in the order, its total, and
 * whether it can still be paid. Pay hands them to Stripe's hosted Checkout;
 * Stripe sends them back here with `?paid=1`, and the page waits for the
 * webhook to confirm the Order rather than claiming a payment it has not seen.
 *
 * The token is the only credential, so the page shows the first name, the
 * lines, the total and where it goes — never the email or phone.
 */
export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string; token: string }>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const { lang, token } = await params;
  const { paid } = await searchParams;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const t = getMessages(locale).pay;
  const contactHref = withLocale("/support", locale);

  const loaded = isPayLinkToken(token) ? await loadPayLinkByToken(supabaseAdmin(), token).catch(() => null) : null;
  if (!loaded) {
    return (
      <Shell>
        <Message title={t.notFoundTitle} body={t.notFoundBody} contact={t.contact} contactHref={contactHref} />
      </Shell>
    );
  }

  const state = payLinkState(loaded.order, loaded.link, new Date());
  const fmt = (n: number) =>
    new Intl.NumberFormat(locale === "zh-CN" ? "zh-CN" : "en-SG", {
      style: "currency",
      currency: loaded.order.currency || "SGD",
    }).format(n);
  const fill = (s: string, values: Record<string, string>) =>
    s.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? `{${k}}`);

  if (state === "expired" || state === "closed") {
    return (
      <Shell>
        <Message
          title={state === "expired" ? t.expiredTitle : t.closedTitle}
          body={state === "expired" ? t.expiredBody : t.closedBody}
          contact={t.contact}
          contactHref={contactHref}
          orderNumber={fill(t.orderNumber, { number: loaded.order.order_number })}
        />
      </Shell>
    );
  }

  const { data: customer } = loaded.order.customer_id
    ? await supabaseAdmin().from("customers").select("first_name").eq("id", loaded.order.customer_id).maybeSingle()
    : { data: null };
  const firstName = (customer?.first_name as string | null | undefined)?.trim() || null;

  const confirming = state === "payable" && paid === "1";
  const validUntil = new Intl.DateTimeFormat(locale === "zh-CN" ? "zh-CN" : "en-SG", {
    timeZone: "Asia/Singapore",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(loaded.link.expires_at));

  return (
    <Shell>
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{fill(t.orderNumber, { number: loaded.order.order_number })}</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {state === "paid" ? t.paidTitle : confirming ? t.confirmingTitle : t.title}
        </h1>
      </div>

      {state === "paid" ? (
        <div className="flex gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <p>{fill(t.paidBody, { number: loaded.order.order_number })}</p>
        </div>
      ) : confirming ? (
        <div className="flex gap-3 rounded-lg border p-4 text-sm">
          <Clock className="h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="space-y-1">
            <p>{t.secure}</p>
            <ConfirmingRefresh slowMessage={t.confirmingSlow} />
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground">
          {firstName ? fill(t.greeting, { name: firstName }) : t.greetingNoName}
        </p>
      )}

      <OrderSummary loaded={loaded} fmt={fmt} t={t} fill={fill} />

      {state === "payable" && !confirming ? (
        <div className="space-y-3">
          <PayButton
            token={loaded.link.token}
            label={fill(t.payButton, { amount: fmt(loaded.order.total) })}
            openingLabel={t.opening}
            errorFallback={t.error}
          />
          <p className="text-center text-xs text-muted-foreground">{t.secure}</p>
          <p className="text-center text-xs text-muted-foreground">{fill(t.validUntil, { date: validUntil })}</p>
        </div>
      ) : null}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col justify-center gap-5 px-4 py-10">
      {children}
    </main>
  );
}

function Message({
  title,
  body,
  contact,
  contactHref,
  orderNumber,
}: {
  title: string;
  body: string;
  contact: string;
  contactHref: string;
  orderNumber?: string;
}) {
  return (
    <div className="space-y-3 text-center">
      {orderNumber ? <p className="text-sm text-muted-foreground">{orderNumber}</p> : null}
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-muted-foreground">{body}</p>
      <Button asChild variant="outline">
        <Link href={contactHref}>{contact}</Link>
      </Button>
    </div>
  );
}

function OrderSummary({
  loaded,
  fmt,
  t,
  fill,
}: {
  loaded: LoadedPayLink;
  fmt: (n: number) => string;
  t: ReturnType<typeof getMessages>["pay"];
  fill: (s: string, values: Record<string, string>) => string;
}) {
  const { order, items } = loaded;
  const address = (order.shipping_address ?? {}) as Record<string, string | null | undefined>;
  const collect = collectLocationOf(order.shipping_address);
  // A studio's address is one free-text line that already names the city.
  const addressLines = [
    address.line1,
    address.line2,
    [collect ? null : address.city, address.postal_code].filter((v) => v && v !== "—").join(" "),
  ].filter((l): l is string => Boolean(l && l.trim()));

  return (
    <div className="space-y-4 rounded-xl border p-4">
      <table className="w-full text-sm">
        <thead className="sr-only">
          <tr>
            <th>{t.item}</th>
            <th>{t.qty}</th>
            <th>{t.amount}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((i) => (
            <tr key={i.id}>
              <td className="py-2 pr-2 align-top">
                <p className="font-medium">{i.product_title}</p>
                {i.variant_title ? <p className="text-xs text-muted-foreground">{i.variant_title}</p> : null}
              </td>
              <td className="whitespace-nowrap py-2 pr-2 text-right align-top text-muted-foreground">× {i.quantity}</td>
              <td className="whitespace-nowrap py-2 text-right align-top tabular-nums">{fmt(i.total_price)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="space-y-1 border-t pt-3 text-sm">
        <Row label={t.subtotal} value={fmt(order.subtotal)} />
        {order.shipping_amount > 0 ? <Row label={t.shipping} value={fmt(order.shipping_amount)} /> : null}
        {order.discount_amount > 0 ? (
          <Row
            label={order.coupon_code ? `${t.discount} (${order.coupon_code})` : t.discount}
            value={`− ${fmt(order.discount_amount)}`}
          />
        ) : null}
        {order.tax_amount > 0 ? <Row label={t.tax} value={fmt(order.tax_amount)} /> : null}
        <Row label={t.total} value={fmt(order.total)} strong />
      </dl>

      <div className="flex gap-2 border-t pt-3 text-sm">
        {collect ? (
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <Truck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div>
          <p className="font-medium">{collect ? fill(t.collectFrom, { place: collect.name }) : t.deliverTo}</p>
          <p className="text-muted-foreground">{addressLines.join(", ")}</p>
        </div>
      </div>

      {order.notes ? (
        <div className="rounded-lg bg-muted/60 p-3 text-sm">
          <p className="text-xs text-muted-foreground">{t.noteFromUs}</p>
          <p className="mt-1 whitespace-pre-line">{order.notes}</p>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${strong ? "pt-1 text-base font-semibold" : ""}`}>
      <dt className={strong ? "" : "text-muted-foreground"}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
