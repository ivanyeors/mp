import { getSiteOrigin } from "@/lib/site-url";
import { renderEmailShell } from "./base";
import {
  addressBlock,
  amountPanel,
  dataTable,
  infoList,
  paragraph,
} from "./components";
import { money, negativeMoney } from "./format";
import type {
  EmailTemplateName,
  OrderEmailAddress,
  OrderEmailData,
  RenderedEmail,
} from "./types";

// ============================================================
// Order lifecycle templates
// ============================================================
//
// Pure functions: (OrderEmailData) -> RenderedEmail. No I/O, no provider
// concerns — trivially unit-testable.
//
// All copy is escaped by the components (see the escaping contract in
// components.ts), so nothing here calls escapeHtml directly.

/**
 * Re-exported for lib/email/partner.ts, which has imported it from here since
 * before the formatter moved into format.ts.
 */
export const formatMoney = money;

function orderUrl(orderNumber: string): string {
  return `${getSiteOrigin()}/account/orders/${encodeURIComponent(orderNumber)}`;
}

function formatAddressLines(address: OrderEmailAddress): string[] {
  return [
    address.recipient,
    address.line1,
    address.line2 || null,
    [address.city, address.state, address.postalCode].filter(Boolean).join(", "),
    address.country,
  ].filter((line): line is string => Boolean(line));
}

function itemsText(data: OrderEmailData): string {
  return data.items
    .map((item) => {
      const variant = item.variantTitle ? ` (${item.variantTitle})` : "";
      return `- ${item.title}${variant} x${item.quantity} — ${money(
        item.totalPrice,
        data.currency
      )}`;
    })
    .join("\n");
}

/** Totals rows shared by the HTML table foot and the plain-text body. */
function totalsRows(
  data: OrderEmailData
): Array<{ label: string; value: string; strong?: boolean }> {
  const rows: Array<{ label: string; value: string; strong?: boolean }> = [
    { label: "Subtotal", value: money(data.subtotal, data.currency) },
  ];
  if (data.shippingAmount > 0)
    rows.push({ label: "Shipping", value: money(data.shippingAmount, data.currency) });
  if (data.discountAmount > 0)
    rows.push({
      label: "Discount",
      value: negativeMoney(data.discountAmount, data.currency),
    });
  if (data.taxAmount > 0)
    rows.push({ label: "Tax", value: money(data.taxAmount, data.currency) });
  rows.push({ label: "Total", value: money(data.total, data.currency), strong: true });
  return rows;
}

function totalsText(data: OrderEmailData): string {
  return totalsRows(data)
    .map((r) => `${r.label}: ${r.value}`)
    .join("\n");
}

function itemsTableHtml(data: OrderEmailData): string {
  return dataTable({
    columns: [
      { key: "item", label: "Item" },
      { key: "qty", label: "Qty", align: "right", width: "48" },
      { key: "amount", label: "Amount", align: "right", width: "110" },
    ],
    rows: data.items.map((item) => ({
      item: item.variantTitle ? `${item.title} (${item.variantTitle})` : item.title,
      qty: String(item.quantity),
      amount: money(item.totalPrice, data.currency),
    })),
    footRows: totalsRows(data),
  });
}

function addressBlockHtml(data: OrderEmailData): string {
  if (!data.shippingAddress) return "";
  return addressBlock("Shipping to", formatAddressLines(data.shippingAddress));
}

function addressBlockText(data: OrderEmailData): string {
  if (!data.shippingAddress) return "";
  return `\nShipping to:\n${formatAddressLines(data.shippingAddress).join("\n")}`;
}

function orderConfirmation(data: OrderEmailData): RenderedEmail {
  const subject = `Order ${data.orderNumber} confirmed`;
  const url = orderUrl(data.orderNumber);
  const text = `Hi ${data.customerName},

Thanks for your order! We've received order ${data.orderNumber} and it's now confirmed.

Items:
${itemsText(data)}

${totalsText(data)}
${addressBlockText(data)}

View your order: ${url}

We'll email you again when it ships.`;

  const html = renderEmailShell({
    title: "Thanks for your order!",
    preheader: `Order ${data.orderNumber} is confirmed.`,
    bodyHtml: `${paragraph(
      `Hi ${data.customerName}, we've received order ${data.orderNumber} and it's now confirmed.`
    )}
${itemsTableHtml(data)}
${addressBlockHtml(data)}
${paragraph("We'll email you again when it ships.", { muted: true })}`,
    cta: { href: url, label: "View your order" },
  });

  return { subject, html, text };
}

function paymentReceipt(data: OrderEmailData): RenderedEmail {
  const subject = `Receipt for order ${data.orderNumber}`;
  const url = orderUrl(data.orderNumber);
  const text = `Hi ${data.customerName},

This is your payment receipt for order ${data.orderNumber}.

${totalsText(data)}

Total charged: ${money(data.total, data.currency)}

View your order: ${url}`;

  const html = renderEmailShell({
    title: "Payment receipt",
    preheader: `Receipt for order ${data.orderNumber}.`,
    bodyHtml: `${paragraph(
      `Hi ${data.customerName}, this is your payment receipt for order ${data.orderNumber}.`
    )}
${infoList(totalsRows(data))}
${amountPanel({ label: "Total charged", amount: money(data.total, data.currency) })}`,
    cta: { href: url, label: "View your order" },
  });

  return { subject, html, text };
}

type Row = { label: string; value: string; strong?: boolean };

function deliveryDays(data: OrderEmailData): string | null {
  if (data.minDays == null) return null;
  const max = data.maxDays ?? data.minDays;
  if (max === data.minDays) return `${max} ${max === 1 ? "day" : "days"}`;
  return `${data.minDays}–${max} days`;
}

/** Courier, delivery estimate, latest checkpoint and tracking number, whichever are known. */
function shipmentRows(data: OrderEmailData, opts: { eta?: boolean; checkpoint?: boolean }): Row[] {
  const eta = opts.eta ? deliveryDays(data) : null;
  const rows: Array<Row | null> = [
    data.courierName ? { label: "Courier", value: data.courierName } : null,
    eta ? { label: "Estimated delivery", value: eta } : null,
    opts.checkpoint && data.trackingCheckpoint ? { label: "Latest update", value: data.trackingCheckpoint } : null,
    data.trackingNumber ? { label: "Tracking number", value: data.trackingNumber, strong: true } : null,
  ];
  return rows.filter((r): r is Row => r !== null);
}

const rowsText = (rows: Row[]) => rows.map((r) => `\n${r.label}: ${r.value}`).join("");

function shipping(data: OrderEmailData): RenderedEmail {
  const subject = `Order ${data.orderNumber} has shipped`;
  const rows = shipmentRows(data, { eta: true });
  const url = data.trackingUrl || orderUrl(data.orderNumber);
  const label = data.trackingUrl ? "Track your package" : "View your order";
  const text = `Hi ${data.customerName},

Good news — order ${data.orderNumber} has shipped!${rowsText(rows)}

${label}: ${url}`;

  const html = renderEmailShell({
    title: "Your order is on its way",
    preheader: `Order ${data.orderNumber} has shipped.`,
    bodyHtml: `${paragraph(`Hi ${data.customerName}, good news — order ${data.orderNumber} has shipped!`)}
${infoList(rows)}`,
    cta: { href: url, label },
  });

  return { subject, html, text };
}

/** A courier status update: same shell as "shipped", with a status-specific line. */
function trackingUpdate(title: string, subject: (n: string) => string, line: string, opts: { checkpoint?: boolean } = {}) {
  return (data: OrderEmailData): RenderedEmail => {
    const url = data.trackingUrl || orderUrl(data.orderNumber);
    const label = data.trackingUrl ? "Track your package" : "View your order";
    const body = `Hi ${data.customerName}, order ${data.orderNumber}: ${line}`;
    const rows = shipmentRows(data, opts);
    return {
      subject: subject(data.orderNumber),
      text: `${body}${rowsText(rows)}\n\n${label}: ${url}`,
      html: renderEmailShell({
        title,
        preheader: subject(data.orderNumber),
        bodyHtml: `${paragraph(body)}
${infoList(rows)}`,
        cta: { href: url, label },
      }),
    };
  };
}

function refund(data: OrderEmailData): RenderedEmail {
  const refundAmount = data.refundAmount ?? data.total;
  const subject = `Refund issued for order ${data.orderNumber}`;
  const url = orderUrl(data.orderNumber);
  const text = `Hi ${data.customerName},

We've issued a refund of ${money(refundAmount, data.currency)} for order ${
    data.orderNumber
  }. It may take a few business days to appear on your statement.

View your order: ${url}`;

  const html = renderEmailShell({
    title: "Refund issued",
    preheader: `A refund for order ${data.orderNumber} is on its way back to you.`,
    bodyHtml: `${paragraph(
      `Hi ${data.customerName}, we've issued a refund for order ${data.orderNumber}.`
    )}
${amountPanel({
      label: "Refund issued",
      amount: money(refundAmount, data.currency),
      caption: "It may take a few business days to appear on your statement.",
    })}`,
    cta: { href: url, label: "View your order" },
  });

  return { subject, html, text };
}

export const ORDER_EMAIL_TEMPLATES: Record<
  EmailTemplateName,
  (data: OrderEmailData) => RenderedEmail
> = {
  order_confirmation: orderConfirmation,
  payment_receipt: paymentReceipt,
  shipping,
  tracking_out_for_delivery: trackingUpdate(
    "Out for delivery",
    (n) => `Order ${n} is out for delivery`,
    "it's out for delivery and should arrive today."
  ),
  tracking_delivery_attempt: trackingUpdate(
    "We missed you",
    (n) => `Delivery attempt for order ${n}`,
    "the courier tried to deliver it but couldn't. They'll try again or leave instructions on the tracking page.",
    { checkpoint: true }
  ),
  tracking_delivered: trackingUpdate(
    "Delivered",
    (n) => `Order ${n} has been delivered`,
    "it's been delivered. We hope you love it."
  ),
  tracking_exception: trackingUpdate(
    "There's a problem with your delivery",
    (n) => `Delivery problem with order ${n}`,
    "the courier has reported a problem with the delivery. We're looking into it and will be in touch.",
    { checkpoint: true }
  ),
  refund,
};

export function renderOrderEmail(
  template: EmailTemplateName,
  data: OrderEmailData
): RenderedEmail {
  return ORDER_EMAIL_TEMPLATES[template](data);
}
