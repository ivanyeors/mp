import { getSiteOrigin } from "@/lib/site-url";
import { renderEmailShell } from "./base";
import {
  addressBlock,
  amountPanel,
  dataTable,
  infoList,
  paragraph,
} from "./components";
import { defaultEmailCopy, defineEmailCopy, fillCopy, type EmailCopy, type EmailCopySpec } from "./copy";
import { money, negativeMoney } from "./format";
import { splitOrderDiscount } from "@/lib/points/order-lines";
import { formatDollars, formatPointsCount, pointsToDollars } from "@/lib/points/value";
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
  // Points used are their own line, apart from the coupon; their dollars
  // are inside discountAmount.
  const { discount, pointsUsed: used } = splitOrderDiscount(data.discountAmount, data.pointsSpent);
  if (discount > 0)
    rows.push({
      label: "Discount",
      value: negativeMoney(discount, data.currency),
    });
  if (used) rows.push({ label: used.label, value: negativeMoney(used.dollars, data.currency) });
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

/** A Self-collect order names the studio it is collected from, not a delivery. */
function addressHeading(address: OrderEmailAddress): string {
  return address.collectAt ? `Collect from ${address.collectAt}` : "Shipping to";
}

function addressBlockHtml(data: OrderEmailData): string {
  if (!data.shippingAddress) return "";
  return addressBlock(addressHeading(data.shippingAddress), formatAddressLines(data.shippingAddress));
}

function addressBlockText(data: OrderEmailData): string {
  if (!data.shippingAddress) return "";
  return `\n${addressHeading(data.shippingAddress)}:\n${formatAddressLines(data.shippingAddress).join("\n")}`;
}

// ------------------------------------------------------------
// The words of each order email (PRD-email-templates)
// ------------------------------------------------------------
//
// Every order email names the customer and the order, so every one takes
// {customer_name} and {order_number}. The tables, amounts, addresses and
// tracking rows are data, and stay in code.

const ORDER_PLACEHOLDERS = {
  customer_name: "The customer's name, as on the order",
  order_number: "The order number, e.g. MP-10428",
};

/** Only in the points lines of the order confirmation. */
const POINTS_PLACEHOLDERS = {
  points: "What the order earns, e.g. 300 points (points lines only)",
  amount: "What they are worth, e.g. S$3.00 (points lines only)",
};

const TRACK_HINT = "The button when the courier gave a tracking link.";
const ORDER_HINT = "The button when there is no tracking link: it opens the order instead.";

type ShipmentCopyKey = "subject" | "heading" | "intro" | "button_track" | "button_order";

function trackingCopy(id: EmailTemplateName, name: string, description: string, d: { subject: string; heading: string; intro: string }) {
  return defineEmailCopy<ShipmentCopyKey>({
    id: `order.${id}`,
    name,
    description,
    placeholders: ORDER_PLACEHOLDERS,
    fields: {
      subject: { label: "Subject", default: d.subject, hint: "Also the inbox preview line." },
      heading: { label: "Heading", default: d.heading },
      intro: { label: "Message", default: d.intro },
      button_track: { label: "Button, with tracking", default: "Track your package", hint: TRACK_HINT },
      button_order: { label: "Button, without tracking", default: "View your order", hint: ORDER_HINT },
    },
  });
}

export const ORDER_EMAIL_COPY = {
  order_confirmation: defineEmailCopy({
    id: "order.order_confirmation",
    name: "Order confirmed",
    description: "Sent when a shop order is paid, with its items, totals and delivery address.",
    placeholders: { ...ORDER_PLACEHOLDERS, ...POINTS_PLACEHOLDERS },
    fields: {
      subject: { label: "Subject", default: "Order {order_number} confirmed" },
      preheader: { label: "Inbox preview line", default: "Order {order_number} is confirmed." },
      heading: { label: "Heading", default: "Thanks for your order!" },
      intro: { label: "Message", default: "Hi {customer_name}, we've received order {order_number} and it's now confirmed." },
      points_earn: {
        label: "Points the order earns",
        default: "This order will earn {points} ({amount}) once it has been delivered and kept for 30 days.",
        optional: true,
        hint: "Only while points are on and the order earns some.",
      },
      points_guest: {
        label: "Points, for a guest",
        default: "Sign in with this email to see and use them.",
        optional: true,
        hint: "Added after the line above when the customer checked out without signing in.",
      },
      closing: { label: "Closing line", default: "We'll email you again when it ships.", optional: true },
      button: { label: "Button", default: "View your order" },
    },
  }),
  payment_receipt: defineEmailCopy({
    id: "order.payment_receipt",
    name: "Payment receipt",
    description: "Sent with the order confirmation: the totals and the amount charged.",
    placeholders: ORDER_PLACEHOLDERS,
    fields: {
      subject: { label: "Subject", default: "Receipt for order {order_number}" },
      preheader: { label: "Inbox preview line", default: "Receipt for order {order_number}." },
      heading: { label: "Heading", default: "Payment receipt" },
      intro: { label: "Message", default: "Hi {customer_name}, this is your payment receipt for order {order_number}." },
      button: { label: "Button", default: "View your order" },
    },
  }),
  shipping: defineEmailCopy({
    id: "order.shipping",
    name: "Order shipped",
    description: "Sent when an order is handed to the courier, with the courier, delivery estimate and tracking number.",
    placeholders: ORDER_PLACEHOLDERS,
    fields: {
      subject: { label: "Subject", default: "Order {order_number} has shipped" },
      preheader: { label: "Inbox preview line", default: "Order {order_number} has shipped." },
      heading: { label: "Heading", default: "Your order is on its way" },
      intro: { label: "Message", default: "Hi {customer_name}, good news — order {order_number} has shipped!" },
      button_track: { label: "Button, with tracking", default: "Track your package", hint: TRACK_HINT },
      button_order: { label: "Button, without tracking", default: "View your order", hint: ORDER_HINT },
    },
  }),
  tracking_out_for_delivery: trackingCopy("tracking_out_for_delivery", "Out for delivery", "Sent when the courier reports the order is out for delivery.", {
    subject: "Order {order_number} is out for delivery",
    heading: "Out for delivery",
    intro: "Hi {customer_name}, order {order_number}: it's out for delivery and should arrive today.",
  }),
  tracking_delivery_attempt: trackingCopy("tracking_delivery_attempt", "Delivery attempt missed", "Sent when the courier reports a failed delivery attempt, with their latest update.", {
    subject: "Delivery attempt for order {order_number}",
    heading: "We missed you",
    intro: "Hi {customer_name}, order {order_number}: the courier tried to deliver it but couldn't. They'll try again or leave instructions on the tracking page.",
  }),
  tracking_delivered: trackingCopy("tracking_delivered", "Order delivered", "Sent when the courier reports the order delivered.", {
    subject: "Order {order_number} has been delivered",
    heading: "Delivered",
    intro: "Hi {customer_name}, order {order_number}: it's been delivered. We hope you love it.",
  }),
  tracking_exception: trackingCopy("tracking_exception", "Delivery problem", "Sent when the courier reports a problem, with their latest update.", {
    subject: "Delivery problem with order {order_number}",
    heading: "There's a problem with your delivery",
    intro: "Hi {customer_name}, order {order_number}: the courier has reported a problem with the delivery. We're looking into it and will be in touch.",
  }),
  refund: defineEmailCopy({
    id: "order.refund",
    name: "Refund issued",
    description: "Sent when a refund is issued on an order, with the amount.",
    placeholders: { ...ORDER_PLACEHOLDERS, refund_amount: "The amount refunded, e.g. SGD 49.00" },
    fields: {
      subject: { label: "Subject", default: "Refund issued for order {order_number}" },
      preheader: { label: "Inbox preview line", default: "A refund for order {order_number} is on its way back to you." },
      heading: { label: "Heading", default: "Refund issued" },
      intro: { label: "Message", default: "Hi {customer_name}, we've issued a refund for order {order_number}." },
      note: { label: "Under the amount", default: "It may take a few business days to appear on your statement." },
      button: { label: "Button", default: "View your order" },
    },
  }),
} satisfies Record<EmailTemplateName, EmailCopySpec>;

type CopyOf<T extends EmailTemplateName> = EmailCopy<keyof (typeof ORDER_EMAIL_COPY)[T]["fields"] & string>;

const orderValues = (data: OrderEmailData) => ({ customer_name: data.customerName, order_number: data.orderNumber });

/** Fill every field of `copy` from `values`. */
function filled<K extends string>(copy: EmailCopy<K>, values: Record<string, string | number | null | undefined>): EmailCopy<K> {
  const out = {} as EmailCopy<K>;
  for (const k of Object.keys(copy) as K[]) out[k] = fillCopy(copy[k], values);
  return out;
}

function orderConfirmation(
  data: OrderEmailData,
  copy: CopyOf<"order_confirmation"> = defaultEmailCopy(ORDER_EMAIL_COPY.order_confirmation),
): RenderedEmail {
  const earn = data.pointsEarn && data.pointsEarn.points > 0 ? data.pointsEarn : null;
  const t = filled(copy, {
    ...orderValues(data),
    points: earn ? formatPointsCount(earn.points) : null,
    amount: earn ? formatDollars(pointsToDollars(earn.points)) : null,
  });
  // The points sentence, and for a guest the sign-in one, only when the order earns.
  const pointsLine = earn && t.points_earn ? [t.points_earn, earn.guest ? t.points_guest : ""].filter(Boolean).join(" ") : "";
  const url = orderUrl(data.orderNumber);
  const text = [
    t.intro,
    "",
    "Items:",
    itemsText(data),
    "",
    `${totalsText(data)}${addressBlockText(data) ? `\n${addressBlockText(data)}` : ""}`,
    ...(pointsLine ? ["", pointsLine] : []),
    "",
    `${t.button}: ${url}`,
    ...(t.closing ? ["", t.closing] : []),
  ].join("\n");

  const html = renderEmailShell({
    title: t.heading,
    preheader: t.preheader,
    bodyHtml: `${paragraph(t.intro)}
${itemsTableHtml(data)}
${addressBlockHtml(data)}
${pointsLine ? paragraph(pointsLine) : ""}
${t.closing ? paragraph(t.closing, { muted: true }) : ""}`,
    cta: { href: url, label: t.button },
  });

  return { subject: t.subject, html, text };
}

function paymentReceipt(
  data: OrderEmailData,
  copy: CopyOf<"payment_receipt"> = defaultEmailCopy(ORDER_EMAIL_COPY.payment_receipt),
): RenderedEmail {
  const t = filled(copy, orderValues(data));
  const url = orderUrl(data.orderNumber);
  const text = `${t.intro}

${totalsText(data)}

Total charged: ${money(data.total, data.currency)}

${t.button}: ${url}`;

  const html = renderEmailShell({
    title: t.heading,
    preheader: t.preheader,
    bodyHtml: `${paragraph(t.intro)}
${infoList(totalsRows(data))}
${amountPanel({ label: "Total charged", amount: money(data.total, data.currency) })}`,
    cta: { href: url, label: t.button },
  });

  return { subject: t.subject, html, text };
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

function shipping(data: OrderEmailData, copy: CopyOf<"shipping"> = defaultEmailCopy(ORDER_EMAIL_COPY.shipping)): RenderedEmail {
  const t = filled(copy, orderValues(data));
  const rows = shipmentRows(data, { eta: true });
  const url = data.trackingUrl || orderUrl(data.orderNumber);
  const label = data.trackingUrl ? t.button_track : t.button_order;
  const text = `${t.intro}${rowsText(rows)}

${label}: ${url}`;

  const html = renderEmailShell({
    title: t.heading,
    preheader: t.preheader,
    bodyHtml: `${paragraph(t.intro)}
${infoList(rows)}`,
    cta: { href: url, label },
  });

  return { subject: t.subject, html, text };
}

/** A courier status update: same shell as "shipped", with a status-specific message. */
function trackingUpdate(name: Exclude<keyof typeof ORDER_EMAIL_COPY, "order_confirmation" | "payment_receipt" | "shipping" | "refund">, opts: { checkpoint?: boolean } = {}) {
  return (data: OrderEmailData, copy: EmailCopy<ShipmentCopyKey> = defaultEmailCopy(ORDER_EMAIL_COPY[name])): RenderedEmail => {
    const t = filled(copy, orderValues(data));
    const url = data.trackingUrl || orderUrl(data.orderNumber);
    const label = data.trackingUrl ? t.button_track : t.button_order;
    const rows = shipmentRows(data, opts);
    return {
      subject: t.subject,
      text: `${t.intro}${rowsText(rows)}\n\n${label}: ${url}`,
      html: renderEmailShell({
        title: t.heading,
        preheader: t.subject,
        bodyHtml: `${paragraph(t.intro)}
${infoList(rows)}`,
        cta: { href: url, label },
      }),
    };
  };
}

function refund(data: OrderEmailData, copy: CopyOf<"refund"> = defaultEmailCopy(ORDER_EMAIL_COPY.refund)): RenderedEmail {
  const refundAmount = money(data.refundAmount ?? data.total, data.currency);
  const t = filled(copy, { ...orderValues(data), refund_amount: refundAmount });
  const url = orderUrl(data.orderNumber);
  const text = `${t.intro}

Refund issued: ${refundAmount}
${t.note}

${t.button}: ${url}`;

  const html = renderEmailShell({
    title: t.heading,
    preheader: t.preheader,
    bodyHtml: `${paragraph(t.intro)}
${amountPanel({
      label: "Refund issued",
      amount: refundAmount,
      caption: t.note,
    })}`,
    cta: { href: url, label: t.button },
  });

  return { subject: t.subject, html, text };
}

/** Each order email's renderer. The copy is optional: without it, the default words. */
export const ORDER_EMAIL_TEMPLATES: {
  [T in EmailTemplateName]: (data: OrderEmailData, copy?: CopyOf<T>) => RenderedEmail;
} = {
  order_confirmation: orderConfirmation,
  payment_receipt: paymentReceipt,
  shipping,
  tracking_out_for_delivery: trackingUpdate("tracking_out_for_delivery"),
  tracking_delivery_attempt: trackingUpdate("tracking_delivery_attempt", { checkpoint: true }),
  tracking_delivered: trackingUpdate("tracking_delivered"),
  tracking_exception: trackingUpdate("tracking_exception", { checkpoint: true }),
  refund,
};

export function renderOrderEmail(template: EmailTemplateName, data: OrderEmailData, copy?: EmailCopy): RenderedEmail {
  return (ORDER_EMAIL_TEMPLATES[template] as (data: OrderEmailData, copy?: EmailCopy) => RenderedEmail)(data, copy);
}
