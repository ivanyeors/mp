// ============================================================
// Customer account emails: the Claim bonus
// (PRD-loyalty-points slice 05; ADR 0030 f, g)
// ============================================================
//
// Transactional: it confirms the points the customer's own sign-in just
// added, so it is sent once, whatever their Marketing consent, through the
// customer_emails ledger (`account.claim_bonus`). It names no old platform
// (owner, 2026-10-21). Its words are editable on Email templates. Campaign
// mail is not sent from here.

import { renderEmailShell } from "./base";
import { infoList, link, paragraph, paragraphHtml } from "./components";
import { defaultEmailCopy, defineEmailCopy, fillCopy, type EmailCopy } from "./copy";
import { formatDollarsShort, formatPointsCount, pointsToDollars } from "@/lib/points/value";
import type { RenderedEmail } from "./types";

export const CLAIM_BONUS_EMAIL_COPY = defineEmailCopy({
  id: "account.claim_bonus",
  name: "Points for signing in",
  description: "Sent once, when a customer's first sign-in adds the sign-in bonus to their points.",
  placeholders: {
    first_name: "The customer's first name",
    points: "The bonus, e.g. 100 points",
    amount: "What the bonus is worth, e.g. S$10",
  },
  fields: {
    subject: { label: "Subject", default: "{amount} in points is in your Mpillow account" },
    preheader: { label: "Inbox preview line", default: "Use it on any shop order, up to half the price." },
    heading: { label: "Heading", default: "Your points are ready" },
    greeting: { label: "Greeting", default: "Hi {first_name},", group: "With a first name" },
    greeting_no_name: { label: "Greeting", default: "Hi,", group: "No first name on file" },
    intro: {
      label: "Message",
      default: "Thanks for signing in. We've added {points} to your account: {amount} off your next shop order.",
    },
    terms: {
      label: "How to use them",
      default:
        "Use them at checkout on any shop order, up to half the products' price. They can't be used on custom pillows, and points used are not refunded.",
      hint: "Keep the two limits (no custom pillows; points used are not refunded): the terms promise them.",
    },
    button: { label: "Button", default: "Shop now" },
    terms_link: { label: "Link to the terms", default: "How points work", hint: "Opens the points terms." },
  },
});

export interface ClaimBonusEmailData {
  firstName: string | null;
  points: number;
  shopUrl: string;
  /** The points terms, /[lang]/points (PRD-loyalty-points slice 08). */
  termsUrl: string;
}

export function renderClaimBonusEmail(
  p: ClaimBonusEmailData,
  copy: EmailCopy<keyof typeof CLAIM_BONUS_EMAIL_COPY.fields & string> = defaultEmailCopy(CLAIM_BONUS_EMAIL_COPY),
): RenderedEmail {
  const values = {
    first_name: p.firstName?.replace(/\s+/g, " ").trim() || null,
    points: formatPointsCount(p.points),
    amount: formatDollarsShort(pointsToDollars(p.points)),
  };
  const t = Object.fromEntries(Object.entries(copy).map(([k, v]) => [k, fillCopy(v, values)])) as typeof copy;
  const greeting = values.first_name ? t.greeting : t.greeting_no_name;

  const text = [greeting, "", t.intro, "", t.terms, `${t.terms_link}: ${p.termsUrl}`, "", `${t.button}: ${p.shopUrl}`].join("\n");
  const html = renderEmailShell({
    title: t.heading,
    preheader: t.preheader,
    bodyHtml: `${paragraph(greeting)}
${paragraph(t.intro)}
${infoList([{ label: "Added to your account", value: `${values.points} (${values.amount})`, strong: true }])}
${paragraph(t.terms, { muted: true })}
${paragraphHtml(link({ href: p.termsUrl, label: t.terms_link }), { muted: true })}`,
    cta: { href: p.shopUrl, label: t.button },
  });
  return { subject: t.subject, html, text };
}
