// ============================================================
// Customer account emails
// ============================================================
//
// The Welcome-back voucher email (PRD-shopify-customer-migration slice 05). It
// is transactional: it confirms the Claim the customer just made by signing in,
// so it is sent once, whatever their Marketing consent. Campaign mail is not
// sent from here.

import { renderEmailShell } from "./base";
import { codeBlock, infoList, paragraph } from "./components";
import { defaultEmailCopy, defineEmailCopy, fillCopy, type EmailCopy } from "./copy";
import { money } from "./format";
import { formatDollarsShort, formatPointsCount, pointsToDollars } from "@/lib/points/value";
import type { RenderedEmail } from "./types";
import type { DiscountType } from "@/lib/types/ecommerce";

export interface WelcomeVoucherEmailData {
  firstName: string | null;
  /** The account email: the only one the voucher works with. */
  email: string;
  code: string;
  /** The Claim issues a fixed amount or free shipping; Staff could edit it to a percentage. */
  discountType: DiscountType;
  /** Amount off for a fixed amount, percent for a percentage. */
  value: number;
  currency: string;
  minOrderAmount: number | null;
  /** Already formatted for Singapore, e.g. "19 December 2026". */
  expiresOn: string;
  shopUrl: string;
}

export function renderWelcomeVoucherEmail(p: WelcomeVoucherEmailData): RenderedEmail {
  const worth =
    p.discountType === "free_shipping"
      ? "Free shipping"
      : p.discountType === "percentage"
        ? `${p.value}% off`
        : `${money(p.value, p.currency)} off`;
  const minimum = p.minOrderAmount ? money(p.minOrderAmount, p.currency) : null;
  const greeting = p.firstName ? `Hi ${p.firstName},` : "Hi,";
  const subject = "Welcome back to Mpillow: your voucher";
  const terms = `It works once, until ${p.expiresOn}, while you're signed in as ${p.email} and checking out with that email. It can't be passed on, and it applies to shop orders, not to custom builds.`;

  const text = [
    greeting,
    "",
    `Your Mpillow account is ready, and you're signed in as ${p.email}. To welcome you back, here is a voucher for the Mpillow shop.`,
    "",
    `Code: ${p.code}`,
    `Worth: ${worth}`,
    ...(minimum ? [`Minimum spend: ${minimum}`] : []),
    `Valid until: ${p.expiresOn}`,
    "",
    terms,
    "",
    `Shop now: ${p.shopUrl}`,
  ].join("\n");

  const html = renderEmailShell({
    title: "Welcome back",
    preheader: `Your welcome-back voucher: ${worth}, until ${p.expiresOn}.`,
    bodyHtml: `${paragraph(greeting)}
${paragraph(
  `Your Mpillow account is ready, and you're signed in as ${p.email}. To welcome you back, here is a voucher for the Mpillow shop.`,
)}
${codeBlock(p.code, { caption: "Enter this code at checkout" })}
${infoList([
  { label: "Worth", value: worth, strong: true },
  ...(minimum ? [{ label: "Minimum spend", value: minimum }] : []),
  { label: "Valid until", value: p.expiresOn },
])}
${paragraph(terms, { muted: true })}`,
    cta: { href: p.shopUrl, label: "Shop now" },
  });

  return { subject, html, text };
}

// ------------------------------------------------------------
// The Claim bonus (PRD-loyalty-points slice 05; ADR 0030 f, g)
// ------------------------------------------------------------
//
// Replaces the Welcome-back voucher email. Transactional for the same reason:
// it confirms the points the customer's own sign-in just added. Sent once,
// through the customer_emails ledger (`account.claim_bonus`). It names no old
// platform (owner, 2026-10-21). Its words are editable on Email templates.

export const CLAIM_BONUS_EMAIL_COPY = defineEmailCopy({
  id: "account.claim_bonus",
  name: "Points for signing in",
  description: "Sent once, when a customer's first sign-in adds the sign-in bonus to their points.",
  placeholders: {
    first_name: "The customer's first name",
    points: "The bonus, e.g. 1,000 points",
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
  },
});

export interface ClaimBonusEmailData {
  firstName: string | null;
  points: number;
  shopUrl: string;
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

  const text = [greeting, "", t.intro, "", t.terms, "", `${t.button}: ${p.shopUrl}`].join("\n");
  const html = renderEmailShell({
    title: t.heading,
    preheader: t.preheader,
    bodyHtml: `${paragraph(greeting)}
${paragraph(t.intro)}
${infoList([{ label: "Added to your account", value: `${values.points} (${values.amount})`, strong: true }])}
${paragraph(t.terms, { muted: true })}`,
    cta: { href: p.shopUrl, label: t.button },
  });
  return { subject: t.subject, html, text };
}
