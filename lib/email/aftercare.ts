// ============================================================
// Aftercare emails (PRD customer-crm slices 07 and 08)
// ============================================================
//
// Service messages about something the customer bought (ADR 0027 f). They go
// through the transactional transport, carry no offer, no price (but the
// check-up's own fee) and no other product, and end with the aftercare footer: how to stop them, in the
// account or by replying (lib/aftercare/state.ts, AFTERCARE_EMAIL_FOOTER).
//
// The Review request keeps Google's review policy (README, sixth hazard): one
// ask, one button, and a "need anything else?" line AFTER the button that is
// not tied to how they feel about the purchase. Never "not happy? talk to us
// instead", which would steer unhappy customers away from reviewing.
//
// The Check-up reminder (slice 08) has one price, and only one: the
// re-adjustment fee, read from Costings at send time and passed in already
// formatted. It says plainly that the visit is paid. It goes only to customers
// with Marketing consent, so it is not unsolicited and carries no `<ADV>`
// label; it is still sent like every Aftercare email, with the same footer.

import { AFTERCARE_EMAIL_FOOTER } from "@/lib/aftercare/state";
import { renderEmailShell } from "./base";
import { button, divider, link, paragraph, paragraphHtml } from "./components";
import { escapeHtml } from "./html";
import type { RenderedEmail } from "./types";

export interface ReviewRequestEmailData {
  firstName: string | null;
  /** `reviewProductLabel`, e.g. "Premium Mpillow". */
  product: string;
  orderNumber: string;
  /** The delivery day in Singapore, e.g. "3 Nov 2026". */
  deliveredOn: string;
  /** Our redirect, `/r/review?t=…`, never Google's link itself, so the click is recorded. */
  reviewUrl: string;
  /** Sign in, then the Profile, where the customer turns these emails off. */
  accountUrl: string;
  /** The staffed sales line (lib/contact.ts), never the automated sender. */
  supportWhatsAppDisplay: string;
  supportWhatsAppUrl: string;
}

/** The line after the button, word for word (slice 07). */
export function reviewRequestContactLine(whatsappDisplay: string): string {
  return `Need anything else — a re-adjustment, a spare cover, or help with your order? Message us on WhatsApp at ${whatsappDisplay}, or just reply to this email.`;
}

const ACCOUNT_PHRASE = "in your account";

export function renderReviewRequestEmail(p: ReviewRequestEmailData): RenderedEmail {
  const name = p.firstName?.replace(/\s+/g, " ").trim();
  const greeting = name ? `Hi ${name},` : "Hi,";
  const thanks = "Thank you for choosing Mpillow";
  const delivered = `Your ${p.product} (order ${p.orderNumber}) was delivered on ${p.deliveredOn}.`;
  const ask =
    "Would you write us a Google review? It takes a minute, and it helps other people find a pillow that fits them.";
  const contact = reviewRequestContactLine(p.supportWhatsAppDisplay);
  const subject = "Would you review Mpillow on Google?";

  const text = [
    greeting,
    "",
    `${thanks}. ${delivered}`,
    "",
    ask,
    "",
    `Write a Google review: ${p.reviewUrl}`,
    "",
    contact,
    `WhatsApp: ${p.supportWhatsAppUrl}`,
    "",
    AFTERCARE_EMAIL_FOOTER,
    `Your account: ${p.accountUrl}`,
  ].join("\n");

  const footerHtml = aftercareFooterHtml(p.accountUrl);

  const contactHtml = escapeHtml(contact).replace(
    escapeHtml(p.supportWhatsAppDisplay),
    link({ href: p.supportWhatsAppUrl, label: p.supportWhatsAppDisplay }),
  );

  const html = renderEmailShell({
    title: thanks,
    preheader: `Your ${p.product} was delivered on ${p.deliveredOn}. Would you review us on Google?`,
    bodyHtml: `${paragraph(greeting)}
${paragraph(delivered)}
${paragraph(ask)}
${button({ href: p.reviewUrl, label: "Write a Google review" })}
${paragraphHtml(contactHtml, { top: 20, muted: true })}
${divider()}
${paragraphHtml(footerHtml, { muted: true })}`,
  });

  return { subject, html, text };
}

/** The footer, with its "in your account" as the link to the Profile. */
function aftercareFooterHtml(accountUrl: string): string {
  const at = AFTERCARE_EMAIL_FOOTER.indexOf(ACCOUNT_PHRASE);
  return at >= 0
    ? `${escapeHtml(AFTERCARE_EMAIL_FOOTER.slice(0, at))}${link({ href: accountUrl, label: ACCOUNT_PHRASE })}${escapeHtml(
        AFTERCARE_EMAIL_FOOTER.slice(at + ACCOUNT_PHRASE.length),
      )}`
    : `${escapeHtml(AFTERCARE_EMAIL_FOOTER)} ${link({ href: accountUrl, label: "Your account" })}`;
}

export interface CheckupEmailData {
  firstName: string | null;
  /** Always "Premium Mpillow": the check-up covers nothing else. */
  product: string;
  orderNumber: string;
  /** The delivery day in Singapore, e.g. "3 Nov 2025". */
  deliveredOn: string;
  /** The re-adjustment fee from Costings, formatted, e.g. "S$30". Never a constant. */
  fee: string;
  /** `/appointments?type=readjustment&item=<order item>`, which sends a signed-out visitor through Sign in. */
  bookingUrl: string;
  /** Sign in, then the Profile, where the customer turns these emails off. */
  accountUrl: string;
  /** The staffed sales line (lib/contact.ts), never the automated sender. */
  supportWhatsAppDisplay: string;
  supportWhatsAppUrl: string;
}

/** The fee line, word for word (slice 08). */
export function checkupFeeLine(fee: string): string {
  return `A re-adjustment is a paid visit: ${fee}, paid when you book.`;
}

export function renderCheckupEmail(p: CheckupEmailData): RenderedEmail {
  const name = p.firstName?.replace(/\s+/g, " ").trim();
  const greeting = name ? `Hi ${name},` : "Hi,";
  const title = "Time for a re-adjustment";
  const due = `Your ${p.product} from order ${p.orderNumber} is due for its yearly re-adjustment, which keeps it fitted to you. It was delivered on ${p.deliveredOn}.`;
  const fee = checkupFeeLine(p.fee);
  const contact = `Questions first? Message our team on WhatsApp at ${p.supportWhatsAppDisplay}, or just reply to this email.`;
  const subject = `Your ${p.product} is due for its yearly re-adjustment`;

  const text = [
    greeting,
    "",
    due,
    "",
    fee,
    "",
    `Book a re-adjustment: ${p.bookingUrl}`,
    "",
    contact,
    `WhatsApp: ${p.supportWhatsAppUrl}`,
    "",
    AFTERCARE_EMAIL_FOOTER,
    `Your account: ${p.accountUrl}`,
  ].join("\n");

  const contactHtml = escapeHtml(contact).replace(
    escapeHtml(p.supportWhatsAppDisplay),
    link({ href: p.supportWhatsAppUrl, label: p.supportWhatsAppDisplay }),
  );

  const html = renderEmailShell({
    title,
    preheader: `Your ${p.product} from order ${p.orderNumber} is due for a re-adjustment. ${fee}`,
    bodyHtml: `${paragraph(greeting)}
${paragraph(due)}
${paragraph(fee)}
${button({ href: p.bookingUrl, label: "Book a re-adjustment" })}
${paragraphHtml(contactHtml, { top: 20, muted: true })}
${divider()}
${paragraphHtml(aftercareFooterHtml(p.accountUrl), { muted: true })}`,
  });

  return { subject, html, text };
}
