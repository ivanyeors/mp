/**
 * Email a Staff order's Payment link (ADR 0048): the Payment request. Sending
 * renews the link for another 7 days, so a resend is also how Staff revive a
 * link that lapsed before the daily job cancelled its Order.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { getEmailTransport } from "@/lib/email";
import { loadEmailCopy } from "@/lib/email/copy-store";
import { PAYMENT_REQUEST_EMAIL_COPY, renderPaymentRequestEmail } from "@/lib/email/payment-request";
import { getDefaultFromAddress } from "@/lib/email/transport";
import { addOrderTimelineEvent } from "@/lib/ecommerce/orders";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/lib/i18n/locales";
import { collectLocationOf } from "@/lib/shipping/self-collect";
import { loadPayLinkForOrder, payLinkUrl, renewPayLink, type LoadedPayLink } from "@/lib/staff-orders/link";
import { payLinkState } from "@/lib/staff-orders/shared";

export type SendOutcome =
  | { ok: true; sentTo: string; expiresAt: string; url: string }
  | { ok: false; status: number; error: string };

/** "Fri, 14 Nov 2026", in Singapore. */
export function formatLinkExpiry(iso: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

/** Where the order goes, as the email's address block reads it. */
export function deliveryBlock(address: Record<string, unknown> | null): { heading: string; lines: string[] } {
  const a = (address ?? {}) as Record<string, string | null | undefined>;
  const collect = collectLocationOf(address);
  const lines = [
    a.recipient,
    a.line1,
    a.line2 || null,
    // A studio's address is one free-text line that already names the city.
    [collect ? null : a.city, a.state, a.postal_code].filter((v) => v && v !== "—").join(" "),
    collect ? null : a.country,
  ].filter((l): l is string => Boolean(l && String(l).trim()));
  return { heading: collect ? `Collect from ${collect.name}` : "Delivering to", lines };
}

export async function sendPaymentRequest(
  admin: SupabaseClient,
  orderId: string,
  opts: { origin: string; actorEmail: string; now?: Date },
): Promise<SendOutcome> {
  const now = opts.now ?? new Date();
  const loaded = await loadPayLinkForOrder(admin, orderId);
  if (!loaded) return { ok: false, status: 404, error: "This order has no payment link." };

  // Only an unpaid, open order can be asked for; an expired link is renewed.
  const state = payLinkState(loaded.order, loaded.link, now);
  if (state === "paid") return { ok: false, status: 409, error: "This order is already paid." };
  if (state === "closed") {
    return { ok: false, status: 409, error: "This order is no longer awaiting payment, so there is nothing to send." };
  }

  const expiresAt = await renewPayLink(admin, orderId, now);
  const fresh: LoadedPayLink = { ...loaded, link: { ...loaded.link, expires_at: expiresAt } };
  const locale = isSupportedLocale(fresh.order.locale) ? fresh.order.locale : DEFAULT_LOCALE;
  const url = payLinkUrl(opts.origin, fresh.link.token, locale);

  const { data: customer } = fresh.order.customer_id
    ? await admin.from("customers").select("first_name").eq("id", fresh.order.customer_id).maybeSingle()
    : { data: null };
  const delivery = deliveryBlock(fresh.order.shipping_address);
  // The words Staff saved on Email templates, or the defaults (never throws).
  const copy = await loadEmailCopy(PAYMENT_REQUEST_EMAIL_COPY);
  const rendered = renderPaymentRequestEmail(
    {
      firstName: (customer?.first_name as string | null | undefined) ?? null,
      orderNumber: fresh.order.order_number,
      currency: fresh.order.currency,
      items: fresh.items.map((i) => ({
        title: i.product_title,
        variantTitle: i.variant_title,
        quantity: i.quantity,
        totalPrice: i.total_price,
      })),
      subtotal: fresh.order.subtotal,
      shippingAmount: fresh.order.shipping_amount,
      discountAmount: fresh.order.discount_amount,
      taxAmount: fresh.order.tax_amount,
      total: fresh.order.total,
      deliveryHeading: delivery.heading,
      deliveryLines: delivery.lines,
      note: fresh.order.notes,
      payUrl: url,
      expires: formatLinkExpiry(expiresAt),
    },
    copy,
  );

  const to = fresh.order.email;
  try {
    await getEmailTransport().send({ to, from: getDefaultFromAddress(), ...rendered });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[staff-order] Payment request for ${orderId} failed:`, message);
    return { ok: false, status: 502, error: "The email could not be sent. Copy the link and send it another way." };
  }

  await admin
    .from("order_payment_links")
    .update({
      last_sent_at: now.toISOString(),
      last_sent_to: to,
      send_count: (fresh.link.send_count ?? 0) + 1,
    })
    .eq("order_id", orderId);
  await addOrderTimelineEvent(orderId, "payment_link_sent", `Payment link emailed to ${to} by ${opts.actorEmail}.`, {
    expires_at: expiresAt,
  }).catch(() => undefined);

  return { ok: true, sentTo: to, expiresAt, url };
}
