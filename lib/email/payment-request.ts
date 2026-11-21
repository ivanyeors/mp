import { renderEmailShell } from "./base";
import { addressBlock, card, dataTable, paragraph, statusPill } from "./components";
import { defaultEmailCopy, defineEmailCopy, fillCopy, type EmailCopy } from "./copy";
import { money, negativeMoney } from "./format";
import type { RenderedEmail } from "./types";

export const PAYMENT_REQUEST_EMAIL_COPY = defineEmailCopy({
  id: "order.payment_request",
  name: "Payment request",
  description:
    "Sent when Staff create an order for a customer from their Customer page, and when Staff resend it. Carries the link to pay.",
  placeholders: {
    name: "Their first name, or 'there' when we have none",
    order_number: "The order number, e.g. MP-20261107-0042",
    total: "What they will pay, e.g. SGD 64.00",
    expires: "When the link stops working, e.g. Fri, 14 Nov 2026",
  },
  fields: {
    subject: { label: "Subject", default: "Your Mpillow order {order_number} is ready to pay" },
    preheader: { label: "Inbox preview line", default: "{total} — pay securely on your phone with a card or PayNow." },
    heading: { label: "Heading", default: "Your order is ready to pay" },
    intro: {
      label: "Message",
      default: "Hi {name}, here's the order we put together for you. You can pay for it on any device with a card or PayNow.",
      hint: "What is in the order and the total follow it.",
    },
    note_label: { label: "Above the note from Staff", default: "A note from us" },
    button: { label: "Button", default: "Pay {total}" },
    expiry: {
      label: "Above the button",
      default: "This link works until {expires}. If it runs out, reply to this email and we'll send you a new one.",
    },
  },
});

export type PaymentRequestEmailData = {
  firstName: string | null;
  orderNumber: string;
  currency: string;
  items: Array<{ title: string; variantTitle?: string | null; quantity: number; totalPrice: number }>;
  subtotal: number;
  shippingAmount: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  deliveryHeading: string;
  deliveryLines: string[];
  note: string | null;
  payUrl: string;
  expires: string;
};

type Copy = EmailCopy<keyof typeof PAYMENT_REQUEST_EMAIL_COPY.fields>;

function totalsRows(p: PaymentRequestEmailData): Array<{ label: string; value: string; strong?: boolean }> {
  const rows: Array<{ label: string; value: string; strong?: boolean }> = [
    { label: "Subtotal", value: money(p.subtotal, p.currency) },
  ];
  if (p.shippingAmount > 0) rows.push({ label: "Shipping", value: money(p.shippingAmount, p.currency) });
  if (p.discountAmount > 0) rows.push({ label: "Discount", value: negativeMoney(p.discountAmount, p.currency) });
  if (p.taxAmount > 0) rows.push({ label: "Tax", value: money(p.taxAmount, p.currency) });
  rows.push({ label: "Total", value: money(p.total, p.currency), strong: true });
  return rows;
}

const itemLabel = (i: PaymentRequestEmailData["items"][number]) =>
  i.variantTitle ? `${i.title} (${i.variantTitle})` : i.title;

export function renderPaymentRequestEmail(
  p: PaymentRequestEmailData,
  copy: Copy = defaultEmailCopy(PAYMENT_REQUEST_EMAIL_COPY),
): RenderedEmail {
  const total = money(p.total, p.currency);
  const values = {
    name: p.firstName?.trim() || "there",
    order_number: p.orderNumber,
    total,
    expires: p.expires,
  };
  const t = {} as Copy;
  for (const k of Object.keys(copy) as Array<keyof Copy>) t[k] = fillCopy(copy[k], values);

  const totals = totalsRows(p);
  const text = [
    t.intro,
    "",
    `Order ${p.orderNumber}`,
    ...p.items.map((i) => `- ${itemLabel(i)} x${i.quantity} — ${money(i.totalPrice, p.currency)}`),
    "",
    ...totals.map((r) => `${r.label}: ${r.value}`),
    "",
    `${p.deliveryHeading}:`,
    ...p.deliveryLines,
    ...(p.note ? ["", `${t.note_label}:`, p.note] : []),
    "",
    `${t.button}:`,
    p.payUrl,
    "",
    t.expiry,
  ].join("\n");

  const html = renderEmailShell({
    title: t.heading,
    preheader: t.preheader,
    bodyHtml: `${statusPill(`Order ${p.orderNumber}`, "neutral")}
${paragraph(t.intro, { top: 16 })}
${dataTable({
  columns: [
    { key: "item", label: "Item" },
    { key: "qty", label: "Qty", align: "right", width: "48" },
    { key: "amount", label: "Amount", align: "right", width: "110" },
  ],
  rows: p.items.map((i) => ({
    item: itemLabel(i),
    qty: String(i.quantity),
    amount: money(i.totalPrice, p.currency),
  })),
  footRows: totals,
})}
${addressBlock(p.deliveryHeading, p.deliveryLines)}
${p.note ? card({ tone: "muted", bodyHtml: `${paragraph(t.note_label, { muted: true })}${paragraph(p.note)}` }) : ""}
${paragraph(t.expiry, { muted: true })}`,
    cta: { href: p.payUrl, label: t.button },
  });

  return { subject: t.subject, html, text };
}
