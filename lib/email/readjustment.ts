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
