/**
 * Re-adjustment emails (ADR 0024). The booking itself is confirmed by the Google
 * invite and WhatsApp, and a paid one gets the order receipt; this covers the
 * one case neither can say: the money is in but the slot went while they paid.
 */

import { renderEmailShell } from "./base";
import { infoList, paragraph } from "./components";
import { money } from "./format";
import type { RenderedEmail } from "./types";

export function renderReadjustmentRescheduleEmail(p: {
  guestName: string;
  productLabel: string;
  /** The time they picked, already formatted for Singapore. */
  wanted: string;
  locationName: string;
  amount: number;
  currency: string;
  orderNumber: string | null;
}): RenderedEmail {
  const subject = "Your re-adjustment: we'll confirm a new time";
  const paid = `${money(p.amount, p.currency)}${p.orderNumber ? ` (order ${p.orderNumber})` : ""}`;
  const text = [
    `Hi ${p.guestName},`,
    "",
    `Thanks — your payment for the re-adjustment of your ${p.productLabel} is in (${paid}).`,
    `The time you picked (${p.wanted} at ${p.locationName}) was taken just as you paid, so our team will contact you shortly to confirm another time.`,
    "",
    "You don't need to do anything or pay again.",
  ].join("\n");
  const html = renderEmailShell({
    title: subject,
    preheader: "Your payment is in — we'll be in touch to re-time your visit.",
    bodyHtml: `${paragraph(`Hi ${p.guestName}, thanks — your payment for the re-adjustment is in.`)}
${infoList([
  { label: "Pillow", value: p.productLabel },
  { label: "Time you picked", value: `${p.wanted} · ${p.locationName}` },
  { label: "Paid", value: paid },
])}
${paragraph("That time was taken just as you paid, so our team will contact you shortly to confirm another. You don't need to do anything or pay again.")}`,
  });
  return { subject, html, text };
}
