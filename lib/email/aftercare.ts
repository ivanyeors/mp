// ============================================================
// Aftercare emails (PRD customer-crm slices 07 and 08)
// ============================================================
//
// Service messages about something the customer bought (ADR 0028 f). They go
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
//
// Staff can reword both (PRD-email-templates), within these rules: each field's
// hint says what it must keep. What the rules fix stays in code: the footer, the
// one button and its link, the contact line's place after the button, and the
// fee, which only ever comes from Costings through {fee}.

import { AFTERCARE_EMAIL_FOOTER } from "@/lib/aftercare/state";
import { renderEmailShell } from "./base";
import { button, divider, link, paragraph, paragraphHtml } from "./components";
import { defaultEmailCopy, defineEmailCopy, fillCopy, type CopyField, type EmailCopy } from "./copy";
import { escapeHtml } from "./html";
import type { RenderedEmail } from "./types";

const AFTERCARE_PLACEHOLDERS = {
  first_name: "The customer's first name, e.g. Wei Ling (empty when we have none)",
  product: "The pillow they bought, e.g. Premium Mpillow",
  order_number: "The order it came in, e.g. MP-20261020-0042",
  delivered_on: "The day it was delivered, e.g. 3 Nov 2026",
  whatsapp_number: "Our staffed WhatsApp number, e.g. +65 8780 5311, shown as a link to WhatsApp",
};

/** One greeting per voice: with the first name we hold, or none. */
const GREETING_FIELDS = {
  greeting: { label: "Greeting", default: "Hi {first_name},", group: "With a first name" },
  greeting_no_name: { label: "Greeting", default: "Hi,", group: "No first name on file" },
} satisfies Record<string, CopyField>;

const NO_OFFER_HINT = "A service message: no offer, no price and no other product.";
const WHATSAPP_HINT = "Keep {whatsapp_number}: it becomes the link to WhatsApp.";

/** Fill every field of `copy` from `values`. */
function filled<K extends string>(copy: EmailCopy<K>, values: Record<string, string | number | null | undefined>): EmailCopy<K> {
  const out = {} as EmailCopy<K>;
  for (const k of Object.keys(copy) as K[]) out[k] = fillCopy(copy[k], values);
  return out;
}

/** A heading reused as the opening of a plain-text line: ends it with a full stop unless it has its own. */
function asSentence(text: string): string {
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}

export const REVIEW_REQUEST_EMAIL_COPY = defineEmailCopy({
  id: "aftercare.review_request",
  name: "Review request",
  description: "Sent once to each customer, 14 days after a delivery, asking for a Google review.",
  placeholders: AFTERCARE_PLACEHOLDERS,
  fields: {
    subject: { label: "Subject", default: "Would you review Mpillow on Google?", hint: NO_OFFER_HINT },
    preheader: {
      label: "Inbox preview line",
      default: "Your {product} was delivered on {delivered_on}. Would you review us on Google?",
    },
    heading: { label: "Heading", default: "Thank you for choosing Mpillow" },
    ...GREETING_FIELDS,
    delivered: { label: "Delivery line", default: "Your {product} (order {order_number}) was delivered on {delivered_on}." },
    ask: {
      label: "The ask",
      default:
        "Would you write us a Google review? It takes a minute, and it helps other people find a pillow that fits them.",
      hint: "One plain ask, as Google's review policy requires: never offer anything for a review, and never ask first whether they are happy.",
    },
    button: { label: "Button", default: "Write a Google review", hint: "The one button: it opens the Google review page." },
    contact: {
      label: "After the button",
      default:
        "Need anything else — a re-adjustment, a spare cover, or help with your order? Message us on WhatsApp at {whatsapp_number}, or just reply to this email.",
      hint: `Goes to everyone, after the button. Keep it about help, never about how they feel about the purchase ("not happy? talk to us instead" steers unhappy customers away from reviewing). ${WHATSAPP_HINT}`,
    },
  },
});

export const CHECKUP_EMAIL_COPY = defineEmailCopy({
  id: "aftercare.checkup",
  name: "Check-up reminder",
  description: "Sent yearly for a Premium Mpillow, to customers with Marketing consent: it is due for a re-adjustment, a paid visit.",
  placeholders: { ...AFTERCARE_PLACEHOLDERS, fee: "The re-adjustment fee from Costings when it is sent, e.g. S$30" },
  fields: {
    subject: { label: "Subject", default: "Your {product} is due for its yearly re-adjustment", hint: NO_OFFER_HINT },
    preheader: {
      label: "Inbox preview line",
      default: "Your {product} from order {order_number} is due for a re-adjustment.",
      hint: "The fee line follows it, so the preview states the fee too.",
    },
    heading: { label: "Heading", default: "Time for a re-adjustment" },
    ...GREETING_FIELDS,
    due: {
      label: "Message",
      default:
        "Your {product} from order {order_number} is due for its yearly re-adjustment, which keeps it fitted to you. It was delivered on {delivered_on}.",
    },
    fee_line: {
      label: "The fee",
      default: "A re-adjustment is a paid visit: {fee}, paid when you book.",
      hint: "Must stay, and must keep {fee}: the email says plainly that the visit is paid, at the fee Costings has when it is sent. Never type a price here.",
    },
    button: { label: "Button", default: "Book a re-adjustment" },
    contact: {
      label: "After the button",
      default: "Questions first? Message our team on WhatsApp at {whatsapp_number}, or just reply to this email.",
      hint: WHATSAPP_HINT,
    },
  },
});

/** The shared values: the greeting's name, the order, and the staffed number. */
function aftercareValues(p: { firstName: string | null; product: string; orderNumber: string; deliveredOn: string; supportWhatsAppDisplay: string }) {
  const name = p.firstName?.replace(/\s+/g, " ").trim();
  return {
    name,
    values: {
      first_name: name ?? "",
      product: p.product,
      order_number: p.orderNumber,
      delivered_on: p.deliveredOn,
      whatsapp_number: p.supportWhatsAppDisplay,
    },
  };
}

/** The contact line, with the WhatsApp number in it as the link. */
function contactHtml(contact: string, p: { supportWhatsAppDisplay: string; supportWhatsAppUrl: string }): string {
  return escapeHtml(contact).replace(
    escapeHtml(p.supportWhatsAppDisplay),
    link({ href: p.supportWhatsAppUrl, label: p.supportWhatsAppDisplay }),
  );
}

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

/** The line after the button, as written by default (slice 07). */
export function reviewRequestContactLine(whatsappDisplay: string): string {
  return fillCopy(REVIEW_REQUEST_EMAIL_COPY.fields.contact.default, { whatsapp_number: whatsappDisplay });
}

const ACCOUNT_PHRASE = "in your account";

export function renderReviewRequestEmail(
  p: ReviewRequestEmailData,
  copy: EmailCopy<keyof typeof REVIEW_REQUEST_EMAIL_COPY.fields> = defaultEmailCopy(REVIEW_REQUEST_EMAIL_COPY),
): RenderedEmail {
  const { name, values } = aftercareValues(p);
  const t = filled(copy, values);
  const greeting = name ? t.greeting : t.greeting_no_name;

  const text = [
    greeting,
    "",
    `${asSentence(t.heading)} ${t.delivered}`,
    "",
    t.ask,
    "",
    `${t.button}: ${p.reviewUrl}`,
    "",
    t.contact,
    `WhatsApp: ${p.supportWhatsAppUrl}`,
    "",
    AFTERCARE_EMAIL_FOOTER,
    `Your account: ${p.accountUrl}`,
  ].join("\n");

  const footerHtml = aftercareFooterHtml(p.accountUrl);

  const html = renderEmailShell({
    title: t.heading,
    preheader: t.preheader,
    bodyHtml: `${paragraph(greeting)}
${paragraph(t.delivered)}
${paragraph(t.ask)}
${button({ href: p.reviewUrl, label: t.button })}
${paragraphHtml(contactHtml(t.contact, p), { top: 20, muted: true })}
${divider()}
${paragraphHtml(footerHtml, { muted: true })}`,
  });

  return { subject: t.subject, html, text };
}

/**
 * The footer, with its "in your account" as the link to the Profile. The
 * points expiry reminders (./points.ts) carry it too, as the check-up does.
 */
export function aftercareFooterHtml(accountUrl: string): string {
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

/** The fee line, as written by default (slice 08). */
export function checkupFeeLine(fee: string): string {
  return fillCopy(CHECKUP_EMAIL_COPY.fields.fee_line.default, { fee });
}

export function renderCheckupEmail(
  p: CheckupEmailData,
  copy: EmailCopy<keyof typeof CHECKUP_EMAIL_COPY.fields> = defaultEmailCopy(CHECKUP_EMAIL_COPY),
): RenderedEmail {
  const { name, values } = aftercareValues(p);
  const t = filled(copy, { ...values, fee: p.fee });
  const greeting = name ? t.greeting : t.greeting_no_name;

  const text = [
    greeting,
    "",
    t.due,
    "",
    t.fee_line,
    "",
    `${t.button}: ${p.bookingUrl}`,
    "",
    t.contact,
    `WhatsApp: ${p.supportWhatsAppUrl}`,
    "",
    AFTERCARE_EMAIL_FOOTER,
    `Your account: ${p.accountUrl}`,
  ].join("\n");

  const html = renderEmailShell({
    title: t.heading,
    // The fee line always follows, so the preview states the fee as the body does.
    preheader: `${t.preheader} ${t.fee_line}`,
    bodyHtml: `${paragraph(greeting)}
${paragraph(t.due)}
${paragraph(t.fee_line)}
${button({ href: p.bookingUrl, label: t.button })}
${paragraphHtml(contactHtml(t.contact, p), { top: 20, muted: true })}
${divider()}
${paragraphHtml(aftercareFooterHtml(p.accountUrl), { muted: true })}`,
  });

  return { subject: t.subject, html, text };
}
