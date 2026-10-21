// ============================================================
// Campaign emails: the Shopify customer migration (slice 08)
// ============================================================
//
// Three campaign emails (PRD-shopify-customer-migration slice 08; ADR 0029 i),
// sent in waves by the wave sender (lib/customer-migration/wave-sender.ts),
// never by the transactional transport:
//
//   migration_announcement    to Migrated customers who are `subscribed`:
//                             the account is ready on the new website, one
//                             button (the Claim link), and the Claim bonus.
//   migration_reminder        once, 7 days on, if still unclaimed: the bonus
//                             again, and the button.
//   migration_service_notice  once, to `not_subscribed` only (owner decision
//                             3): where the account lives, re-adjustments and
//                             support. NO offer or promotion; counsel confirms
//                             the copy (PRD, legal points).
//
// The Claim bonus replaced the Welcome-back voucher (PRD-loyalty-points slice
// 05; ADR 0030), and none of them names the old platform or a move: the
// customer is told the website is new (owner, 2026-10-21). Admin Panel →
// Email campaigns (PRD-email-marketing) is the usual way to write to them now.
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

/** The Claim bonus a sign-in grants (ADR 0030 f), as the email states it. */
export interface CampaignBonusTerms {
  /** "1,000 points". */
  points: string;
  /** "S$10". */
  amount: string;
  /** Months from this email to sign in for it. */
  months: number;
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
  bonus: CampaignBonusTerms;
}

export interface MigrationReminderEmailData extends CampaignRecipient {
  /** A Claim link minted for this email (not the announcement's). */
  claimUrl: string;
  bonus: CampaignBonusTerms;
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
  "A one-time service notice for people who have shopped with Mpillow. It is not marketing.";

const greet = (firstName: string | null) => {
  const name = firstName?.replace(/\s+/g, " ").trim();
  return name ? `Hi ${name},` : "Hi,";
};

/** "1,000 points, S$10 off your next shop order". */
export function claimBonusPhrase(b: Pick<CampaignBonusTerms, "points" | "amount">): string {
  return `${b.points}, ${b.amount} off your next shop order`;
}

/** The two limits the terms promise, in every email that states the bonus. */
export const BONUS_TERMS =
  "Use them at checkout on any shop order, up to half the products' price. They can't be used on custom pillows, and points used are not refunded.";

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
  const news = `We have a new website, and your Mpillow account is ready on it. There's nothing to fill in and no password to set: sign in with ${p.email}, the email you shopped with, and it's yours.`;
  const offer = `Sign in within ${p.bonus.months} months of this email and we'll add ${claimBonusPhrase(p.bonus)}.`;

  const text = [
    greeting,
    "",
    news,
    "",
    `Sign in to your account: ${p.claimUrl}`,
    "",
    "Points for signing in",
    offer,
    BONUS_TERMS,
    "",
    "What your account does",
    ...ACCOUNT_FEATURES.map((f) => `- ${f}`),
    "",
    CAMPAIGN_CONSENT_NOTE,
    `Unsubscribe: ${p.unsubscribeUrl}`,
  ].join("\n");

  const html = renderEmailShell({
    title: subject,
    preheader: `Sign in within ${p.bonus.months} months for ${p.bonus.amount} in points.`,
    // The one button: the Claim link, straight after the news.
    bodyHtml: `${paragraph(greeting)}
${paragraph(news)}
${button({ href: p.claimUrl, label: "Sign in to your account" })}
${heading("Points for signing in", 2, { top: 24 })}
${paragraph(offer)}
${paragraph(BONUS_TERMS, { muted: true })}
${heading("What your account does", 2, { top: 12 })}
${bulletList(ACCOUNT_FEATURES)}`,
    footer: CAMPAIGN_CONSENT_NOTE,
    unsubscribeUrl: p.unsubscribeUrl,
  });

  return { subject, html, text };
}

export function renderMigrationReminderEmail(p: MigrationReminderEmailData): RenderedEmail {
  const greeting = greet(p.firstName);
  const subject = `${p.bonus.amount} in points is waiting in your Mpillow account`;
  const body = `A quick reminder: your Mpillow account is ready on our new website. Sign in with ${p.email} within ${p.bonus.months} months of our first email, and we'll add ${claimBonusPhrase(p.bonus)}.`;
  const once = "This is the only reminder we'll send.";

  const text = [
    greeting,
    "",
    body,
    BONUS_TERMS,
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
    preheader: `Sign in to collect ${p.bonus.points}.`,
    bodyHtml: `${paragraph(greeting)}
${paragraph(body)}
${paragraph(BONUS_TERMS, { muted: true })}`,
    cta: { href: p.claimUrl, label: "Sign in to your account" },
    footer: `${once} ${CAMPAIGN_CONSENT_NOTE}`,
    unsubscribeUrl: p.unsubscribeUrl,
  });

  return { subject, html, text };
}

export function renderMigrationServiceNoticeEmail(p: MigrationServiceNoticeEmailData): RenderedEmail {
  const greeting = greet(p.firstName);
  const subject = "Mpillow has a new website";
  const move = `Mpillow has a new website at ${p.siteHost}. This one-time notice is so you know where to find us.`;
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
