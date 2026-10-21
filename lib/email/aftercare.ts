// ============================================================
// Aftercare emails (PRD customer-crm slices 07 and 08)
// ============================================================
//
// Service messages about something the customer bought (ADR 0027 f). They go
// through the transactional transport, carry no offer, no price and no other
// product, and end with the aftercare footer: how to stop them, in the
// account or by replying (lib/aftercare/state.ts, AFTERCARE_EMAIL_FOOTER).
//
// The Review request keeps Google's review policy (README, sixth hazard): one
// ask, one button, and a "need anything else?" line AFTER the button that is
// not tied to how they feel about the purchase. Never "not happy? talk to us
// instead", which would steer unhappy customers away from reviewing.

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

  // The footer's "in your account" is the link to the Profile.
  const at = AFTERCARE_EMAIL_FOOTER.indexOf(ACCOUNT_PHRASE);
  const footerHtml =
    at >= 0
      ? `${escapeHtml(AFTERCARE_EMAIL_FOOTER.slice(0, at))}${link({ href: p.accountUrl, label: ACCOUNT_PHRASE })}${escapeHtml(
          AFTERCARE_EMAIL_FOOTER.slice(at + ACCOUNT_PHRASE.length),
        )}`
      : `${escapeHtml(AFTERCARE_EMAIL_FOOTER)} ${link({ href: p.accountUrl, label: "Your account" })}`;

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
