import { renderEmailShell } from "./base";
import { infoList, paragraph } from "./components";
import { defaultEmailCopy, defineEmailCopy, fillCopy, type EmailCopy } from "./copy";
import { money } from "./format";
import type { RenderedEmail } from "./types";

export const READJUSTMENT_RESCHEDULE_EMAIL_COPY = defineEmailCopy({
  id: "readjustment.reschedule",
  name: "Re-adjustment paid — new time needed",
  description: "Sent when a customer pays for a re-adjustment but the time they picked was taken while they paid.",
  placeholders: {
    guest_name: "The name they booked under, e.g. Ada Tan",
    product: "The pillow to re-adjust, e.g. Premium Mpillow · Size M",
    wanted_time: "The time they picked, e.g. Fri, 14 Nov, 2:30 pm",
    location: "The studio they picked, e.g. Mpillow Studio",
    amount: "What they paid, e.g. SGD 30.00",
  },
  fields: {
    subject: { label: "Subject", default: "Your re-adjustment: we'll confirm a new time" },
    preheader: { label: "Inbox preview line", default: "Your payment is in — we'll be in touch to re-time your visit." },
    heading: { label: "Heading", default: "Your re-adjustment: we'll confirm a new time" },
    intro: { label: "Message", default: "Hi {guest_name}, thanks — your payment for the re-adjustment is in.", hint: "The pillow, the time they picked and what they paid follow it." },
    next: {
      label: "Under the details",
      default: "That time was taken just as you paid, so our team will contact you shortly to confirm another. You don't need to do anything or pay again.",
      hint: "What happens now: say that they need not pay again.",
    },
  },
});

export const READJUSTMENT_CANCELLED_EMAIL_COPY = defineEmailCopy({
  id: "readjustment.cancelled",
  name: "Paid re-adjustment cancelled",
  description:
    "Sent when a paid re-adjustment visit is cancelled, by the customer or by Staff, saying what happens to the fee.",
  placeholders: {
    guest_name: "The name they booked under, e.g. Ada Tan",
    visit_time: "The visit's time, e.g. Fri, 14 Nov, 2:30 pm",
    amount: "The fee, e.g. SGD 30.00",
  },
  fields: {
    subject: { label: "Subject", default: "Your re-adjustment visit is cancelled" },
    preheader: {
      label: "Inbox preview line",
      default: "Your visit on {visit_time} is cancelled. Here's what happens to your fee.",
    },
    heading: { label: "Heading", default: "Re-adjustment cancelled" },
    intro: {
      label: "Message",
      default: "Hi {guest_name}, your re-adjustment visit on {visit_time} has been cancelled.",
      hint: "The pillow, the visit and the fee follow it, then one of the lines below.",
    },
    refunded: {
      label: "Refunded automatically",
      group: "What happens to the fee",
      default:
        "We've refunded {amount} to the way you paid. Refunds usually reach your account within 5–10 business days, depending on your bank.",
    },
    visit_day: {
      label: "Cancelled on the visit day",
      group: "What happens to the fee",
      default:
        "Cancellations on the day of the visit are subject to manual refunds only, so your {amount} fee hasn't been refunded automatically. Our team will review it and let you know.",
    },
    paynow: {
      label: "Paid by PayNow",
      group: "What happens to the fee",
      default:
        "You paid by PayNow, and PayNow payments are refunded by our team only: we'll either refund your {amount} manually or add it to your Mpillow account as points of the same value, and let you know which.",
    },
    refund_failed: {
      label: "Automatic refund failed",
      group: "What happens to the fee",
      default: "We couldn't refund your {amount} automatically. Our team will refund it manually and let you know.",
    },
  },
});

export type CancelledFee = "refunded" | "visit_day" | "paynow" | "refund_failed";

function filled<K extends string>(copy: EmailCopy<K>, values: Record<string, string | number | null | undefined>): EmailCopy<K> {
  const out = {} as EmailCopy<K>;
  for (const k of Object.keys(copy) as K[]) out[k] = fillCopy(copy[k], values);
  return out;
}

export function renderReadjustmentRescheduleEmail(
  p: {
    guestName: string;
    productLabel: string;
    wanted: string;
    locationName: string;
    amount: number;
    currency: string;
    orderNumber: string | null;
  },
  copy: EmailCopy<keyof typeof READJUSTMENT_RESCHEDULE_EMAIL_COPY.fields> = defaultEmailCopy(READJUSTMENT_RESCHEDULE_EMAIL_COPY),
): RenderedEmail {
  const amount = money(p.amount, p.currency);
  const paid = `${amount}${p.orderNumber ? ` (order ${p.orderNumber})` : ""}`;
  const t = filled(copy, { guest_name: p.guestName, product: p.productLabel, wanted_time: p.wanted, location: p.locationName, amount });
  const rows = [
    { label: "Pillow", value: p.productLabel },
    { label: "Time you picked", value: `${p.wanted} · ${p.locationName}` },
    { label: "Paid", value: paid },
  ];
  const text = [t.intro, "", ...rows.map((r) => `${r.label}: ${r.value}`), "", t.next].join("\n");
  const html = renderEmailShell({
    title: t.heading,
    preheader: t.preheader,
    bodyHtml: `${paragraph(t.intro)}
${infoList(rows)}
${paragraph(t.next)}`,
  });
  return { subject: t.subject, html, text };
}

export function renderReadjustmentCancelledEmail(
  p: {
    fee: CancelledFee;
    guestName: string;
    productLabel: string;
    visit: string;
    locationName: string | null;
    amount: number;
    currency: string;
    orderNumber: string | null;
  },
  copy: EmailCopy<keyof typeof READJUSTMENT_CANCELLED_EMAIL_COPY.fields> = defaultEmailCopy(READJUSTMENT_CANCELLED_EMAIL_COPY),
): RenderedEmail {
  const amount = money(p.amount, p.currency);
  const t = filled(copy, { guest_name: p.guestName, visit_time: p.visit, amount });
  const rows = [
    { label: "Pillow", value: p.productLabel },
    { label: "Visit", value: p.locationName ? `${p.visit} · ${p.locationName}` : p.visit },
    { label: "Fee", value: `${amount}${p.orderNumber ? ` (order ${p.orderNumber})` : ""}` },
  ];
  const fee = t[p.fee];
  const text = [t.intro, "", ...rows.map((r) => `${r.label}: ${r.value}`), "", fee].join("\n");
  const html = renderEmailShell({
    title: t.heading,
    preheader: t.preheader,
    bodyHtml: `${paragraph(t.intro)}
${infoList(rows)}
${paragraph(fee)}`,
  });
  return { subject: t.subject, html, text };
}
