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
import { money } from "./format";
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
