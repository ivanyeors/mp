// ============================================================
// Points emails (PRD-loyalty-points slice 07; ADR 0030 rules o, p)
// ============================================================
//
// The expiry reminders: 3, 2 and 1 months before a balance expires, 24 months
// after the customer's last purchase. Each goes once per clock, through the
// customer_emails ledger (`points.expiry_3m`, `_2m`, `_1m`, keyed on the Order
// or Claim bonus entry that started the clock; lib/points/expiry-server.ts).
//
// They go only to customers with Marketing consent, through the check-up
// reminder's gate (lib/aftercare/checkup.ts, `requireMarketingConsent`). Like
// the check-up they are sent by the transactional transport, carry no `<ADV>`
// label and no unsubscribe link, and end with the aftercare footer: how to stop
// them, in the account or by replying (AFTERCARE_EMAIL_FOOTER).
//
// The three share one set of words (POINTS_EXPIRY_EMAIL_COPY), editable on
// Email templates; {time_left} is what differs. The balance, the date and the
// links come from code. No word of the old platform (owner, 2026-10-21).

import { AFTERCARE_EMAIL_FOOTER } from "@/lib/aftercare/state";
import { formatDollars, formatPointsCount, pointsToDollars } from "@/lib/points/value";
import { aftercareFooterHtml } from "./aftercare";
import { renderEmailShell } from "./base";
import { button, divider, link, paragraph, paragraphHtml } from "./components";
import { defaultEmailCopy, defineEmailCopy, fillCopy, type EmailCopy } from "./copy";
import type { PointsExpiryReminderMonths } from "@/lib/points/expiry";
import type { RenderedEmail } from "./types";

export const POINTS_EXPIRY_EMAIL_COPY = defineEmailCopy({
  id: "points.expiry",
  name: "Points expiry reminder",
  description:
    "Sent 3, 2 and 1 months before a customer's points expire, to customers with Marketing consent who hold at least the minimum to use.",
  placeholders: {
    first_name: "The customer's first name, e.g. Wei Ling (empty when we have none)",
    points: "Their balance, e.g. 2,130 points",
    amount: "What the balance is worth, e.g. S$21.30",
    expires_on: "The day they expire, e.g. 12 March 2028",
    time_left: "How long is left: 3 months, 2 months or 1 month",
  },
  fields: {
    subject: { label: "Subject", default: "Your Mpillow points expire on {expires_on}" },
    preheader: { label: "Inbox preview line", default: "You have {points} ({amount}). Any purchase keeps them." },
    heading: { label: "Heading", default: "Your points expire in {time_left}" },
    greeting: { label: "Greeting", default: "Hi {first_name},", group: "With a first name" },
    greeting_no_name: { label: "Greeting", default: "Hi,", group: "No first name on file" },
    balance: {
      label: "Message",
      default: "You have {points} ({amount}). They expire on {expires_on} unless you make a purchase before then.",
      hint: "Keep {points}, {amount} and {expires_on}: the email states the balance and the day it expires.",
    },
    use: {
      label: "How to keep and use them",
      default: "Any purchase keeps them, however small. Use them at checkout on any shop order, up to half the products' price.",
      hint: "Say only what the terms say: any purchase keeps them; shop orders only, up to half the products' price.",
    },
    button: { label: "Button", default: "Shop now", hint: "The one button: it opens the shop." },
    points_link: { label: "Link to their points", default: "See your points", hint: "Opens their Profile." },
    terms_link: { label: "Link to the terms", default: "How points work", hint: "Opens the points terms." },
  },
});

export interface PointsExpiryEmailData {
  firstName: string | null;
  /** The available balance when it is sent. */
  points: number;
  /** The day they expire, already formatted, e.g. "12 March 2028". */
  expiresOn: string;
  /** Which reminder: 3, 2 or 1 month before. */
  months: PointsExpiryReminderMonths;
  /** The shop, in the customer's locale. */
  shopUrl: string;
  /** The points terms, `/{locale}/points`. */
  termsUrl: string;
  /** The Profile, `/{locale}/account`: their points, and where these emails are turned off. */
  accountUrl: string;
}

/** "3 months", "1 month". */
export function timeLeft(months: number): string {
  return months === 1 ? "1 month" : `${months} months`;
}

export function renderPointsExpiryEmail(
  p: PointsExpiryEmailData,
  copy: EmailCopy<keyof typeof POINTS_EXPIRY_EMAIL_COPY.fields & string> = defaultEmailCopy(POINTS_EXPIRY_EMAIL_COPY),
): RenderedEmail {
  const name = p.firstName?.replace(/\s+/g, " ").trim() || null;
  const values = {
    first_name: name ?? "",
    points: formatPointsCount(p.points),
    amount: formatDollars(pointsToDollars(p.points)),
    expires_on: p.expiresOn,
    time_left: timeLeft(p.months),
  };
  const t = Object.fromEntries(Object.entries(copy).map(([k, v]) => [k, fillCopy(v, values)])) as typeof copy;
  const greeting = name ? t.greeting : t.greeting_no_name;

  const text = [
    greeting,
    "",
    t.balance,
    "",
    t.use,
    "",
    `${t.button}: ${p.shopUrl}`,
    "",
    `${t.points_link}: ${p.accountUrl}`,
    `${t.terms_link}: ${p.termsUrl}`,
    "",
    AFTERCARE_EMAIL_FOOTER,
    `Your account: ${p.accountUrl}`,
  ].join("\n");

  const links = `${link({ href: p.accountUrl, label: t.points_link })} &middot; ${link({ href: p.termsUrl, label: t.terms_link })}`;

  const html = renderEmailShell({
    title: t.heading,
    preheader: t.preheader,
    bodyHtml: `${paragraph(greeting)}
${paragraph(t.balance)}
${paragraph(t.use)}
${button({ href: p.shopUrl, label: t.button })}
${paragraphHtml(links, { top: 20, muted: true })}
${divider()}
${paragraphHtml(aftercareFooterHtml(p.accountUrl), { muted: true })}`,
  });

  return { subject: t.subject, html, text };
}
