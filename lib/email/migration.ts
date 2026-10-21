// ============================================================
// Campaign emails: the Shopify customer migration (slice 08)
// ============================================================
//
// Three campaign emails (PRD-shopify-customer-migration slice 08; ADR 0029 i),
// sent in waves by the wave sender (lib/customer-migration/wave-sender.ts),
// never by the transactional transport:
//
//   migration_announcement    to Migrated customers who are `subscribed`:
//                             the account is ready, one button (the Claim
//                             link), the Welcome-back voucher and its terms.
//   migration_reminder        once, 7 days on, if still unclaimed: the last
//                             day to sign in for the voucher, and the button.
//   migration_service_notice  once, to `not_subscribed` only (owner decision
//                             3): where the account lives, re-adjustments and
//                             support. NO offer, voucher or promotion; counsel
//                             confirms the copy (PRD, legal points).
//
// Each is campaign mail: it renders the footer's unsubscribe link
// (`unsubscribeUrl`, the confirm page) and is sent with `List-Unsubscribe`.
// The welcome-back voucher's own email (account.ts) is transactional and
// carries neither.
//
// Every renderer is pure: the sender resolves the links and formats the terms.

import { renderEmailShell } from "./base";
import { bulletList, button, heading, link, paragraph, paragraphHtml } from "./components";
import { escapeHtml } from "./html";
import type { RenderedEmail } from "./types";

/** The Welcome-back voucher a first sign-in issues, as the email states it. */
export interface CampaignVoucherTerms {
  kind: "fixed_amount" | "free_shipping";
  /** "SGD 20.00" for a fixed amount; null for free shipping. */
  amount: string | null;
  /** "SGD 50.00", or null for no minimum. */
  minimumSpend: string | null;
  /** Days the voucher lasts from the first sign-in. */
  validDays: number;
  /** The last day a sign-in issues one, e.g. "31 December 2026". */
  issueUntil: string;
}

interface CampaignRecipient {
  firstName: string | null;
  /** The account email: the one to sign in with. */
  email: string;
  /** The Customer's unsubscribe confirm page. */
  unsubscribeUrl: string;
}

export interface MigrationAnnouncementEmailData extends CampaignRecipient {
  /** The Claim link minted for this email. */
  claimUrl: string;
  voucher: CampaignVoucherTerms;
}

export interface MigrationReminderEmailData extends CampaignRecipient {
  /** A Claim link minted for this email (not the announcement's). */
  claimUrl: string;
  voucher: CampaignVoucherTerms;
}

export interface MigrationServiceNoticeEmailData extends CampaignRecipient {
  /** A Claim link minted for this email: it signs in, and offers nothing. */
  signInUrl: string;
  /** The site's host, e.g. "custom.mpillow.com". */
  siteHost: string;
  /** Re-adjustment booking. */
  readjustmentUrl: string;
  /** The staffed sales line (lib/contact.ts), never the automated sender. */
  supportWhatsAppDisplay: string;
  supportWhatsAppUrl: string;
}

/** Why a subscribed customer gets these: the footer's note. */
export const CAMPAIGN_CONSENT_NOTE =
  "You're getting this because you agreed to hear from Mpillow when you shopped with us.";

/** Why someone who never agreed to marketing gets the service notice. */
export const SERVICE_NOTICE_NOTE =
  "A one-time service notice for people who shopped with Mpillow on Shopify. It is not marketing.";

const greet = (firstName: string | null) => {
  const name = firstName?.replace(/\s+/g, " ").trim();
  return name ? `Hi ${name},` : "Hi,";
};

/** "SGD 20.00 off a shop order of SGD 50.00 or more", "free shipping on a shop order". */
export function voucherOfferPhrase(v: Pick<CampaignVoucherTerms, "kind" | "amount" | "minimumSpend">): string {
  const base = v.kind === "free_shipping" || !v.amount ? "free shipping on a shop order" : `${v.amount} off a shop order`;
  return v.minimumSpend ? `${base} of ${v.minimumSpend} or more` : base;
}

/** What the account does: the welcome page's own list (app/[lang]/account/welcome). */
const ACCOUNT_FEATURES = [
  "Saves your delivery addresses for a faster checkout",
  "Books a re-adjustment for your pillow",
  "Follows your orders and their delivery",
  "Starts a return from the order it belongs to",
];

export function renderMigrationAnnouncementEmail(p: MigrationAnnouncementEmailData): RenderedEmail {
  const greeting = greet(p.firstName);
  const subject = "Your Mpillow account is ready";
  const move = `Mpillow's online shop has moved from Shopify to our own site, and your account is ready. There's nothing to fill in and no password to set: sign in with ${p.email}, the email you shopped with, and it's yours.`;
  const offer = `When you first sign in, we'll add a welcome-back voucher to your account: ${voucherOfferPhrase(p.voucher)}. Sign in by ${p.voucher.issueUntil} to get it.`;
  const terms = `The voucher is valid for ${p.voucher.validDays} days from your first sign-in. It works once, while you're signed in as ${p.email} and checking out with that email. It can't be passed on, and it applies to shop orders, not to custom builds.`;

  const text = [
    greeting,
    "",
    move,
    "",
    `Sign in to your account: ${p.claimUrl}`,
    "",
    "A welcome-back voucher",
    offer,
    terms,
    "",
    "What your account does",
    ...ACCOUNT_FEATURES.map((f) => `- ${f}`),
    "",
    CAMPAIGN_CONSENT_NOTE,
    `Unsubscribe: ${p.unsubscribeUrl}`,
  ].join("\n");

  const html = renderEmailShell({
    title: subject,
    preheader: `Sign in with the email you shopped with for a welcome-back voucher, until ${p.voucher.issueUntil}.`,
    // The one button: the Claim link, straight after the news.
    bodyHtml: `${paragraph(greeting)}
${paragraph(move)}
${button({ href: p.claimUrl, label: "Sign in to your account" })}
${heading("A welcome-back voucher", 2, { top: 24 })}
${paragraph(offer)}
${paragraph(terms, { muted: true })}
${heading("What your account does", 2, { top: 12 })}
${bulletList(ACCOUNT_FEATURES)}`,
    footer: CAMPAIGN_CONSENT_NOTE,
    unsubscribeUrl: p.unsubscribeUrl,
  });

  return { subject, html, text };
}

export function renderMigrationReminderEmail(p: MigrationReminderEmailData): RenderedEmail {
  const greeting = greet(p.firstName);
  const subject = "Your welcome-back voucher is waiting";
  const body = `A quick reminder: your Mpillow account is ready. Sign in with ${p.email} by ${p.voucher.issueUntil}, and we'll add your welcome-back voucher: ${voucherOfferPhrase(p.voucher)}.`;
  const once = "This is the only reminder we'll send.";

  const text = [
    greeting,
    "",
    body,
    "",
    `Sign in to your account: ${p.claimUrl}`,
    "",
    once,
    "",
    CAMPAIGN_CONSENT_NOTE,
    `Unsubscribe: ${p.unsubscribeUrl}`,
  ].join("\n");

  const html = renderEmailShell({
    title: subject,
    preheader: `Sign in by ${p.voucher.issueUntil} to get it.`,
    bodyHtml: `${paragraph(greeting)}
${paragraph(body)}`,
    cta: { href: p.claimUrl, label: "Sign in to your account" },
    footer: `${once} ${CAMPAIGN_CONSENT_NOTE}`,
    unsubscribeUrl: p.unsubscribeUrl,
  });

  return { subject, html, text };
}

export function renderMigrationServiceNoticeEmail(p: MigrationServiceNoticeEmailData): RenderedEmail {
  const greeting = greet(p.firstName);
  const subject = "Mpillow has moved";
  const move = `Mpillow's online shop has moved from Shopify to ${p.siteHost}. This one-time notice is so you know where to find us.`;
  const signIn = `To sign in, use ${p.email}, the email you shopped with. There's no password to set.`;
  const readjust = "Re-adjustments for your pillow are booked on the new site.";
  const support = `Need help? Message us on WhatsApp at ${p.supportWhatsAppDisplay}, or reply to this email.`;

  const text = [
    greeting,
    "",
    move,
    "",
    signIn,
    `Sign in: ${p.signInUrl}`,
    "",
    readjust,
    `Book a re-adjustment: ${p.readjustmentUrl}`,
    "",
    support,
    `WhatsApp: ${p.supportWhatsAppUrl}`,
    "",
    SERVICE_NOTICE_NOTE,
    `Unsubscribe: ${p.unsubscribeUrl}`,
  ].join("\n");

  const supportHtml = escapeHtml(support).replace(
    escapeHtml(p.supportWhatsAppDisplay),
    link({ href: p.supportWhatsAppUrl, label: p.supportWhatsAppDisplay }),
  );

  const html = renderEmailShell({
    title: subject,
    preheader: `Where your Mpillow account lives now: ${p.siteHost}.`,
    bodyHtml: `${paragraph(greeting)}
${paragraph(move)}
${heading("Signing in", 2, { top: 12 })}
${paragraph(signIn)}
${button({ href: p.signInUrl, label: "Sign in" })}
${heading("Re-adjustments", 2, { top: 24 })}
${paragraphHtml(`${escapeHtml(readjust)} ${link({ href: p.readjustmentUrl, label: "Book a re-adjustment" })}`)}
${heading("Support", 2, { top: 12 })}
${paragraphHtml(supportHtml)}`,
    footer: SERVICE_NOTICE_NOTE,
    unsubscribeUrl: p.unsubscribeUrl,
  });

  return { subject, html, text };
}
