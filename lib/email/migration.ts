import { renderEmailShell } from "./base";
import { bulletList, button, heading, link, paragraph, paragraphHtml } from "./components";
import { escapeHtml } from "./html";
import type { RenderedEmail } from "./types";

export interface CampaignBonusTerms {
  points: string;
  amount: string;
  months: number;
}

interface CampaignRecipient {
  firstName: string | null;
  email: string;
  unsubscribeUrl: string;
}

export interface MigrationAnnouncementEmailData extends CampaignRecipient {
  claimUrl: string;
  bonus: CampaignBonusTerms;
  termsUrl: string;
}

export interface MigrationReminderEmailData extends CampaignRecipient {
  claimUrl: string;
  bonus: CampaignBonusTerms;
  termsUrl: string;
}

export interface MigrationServiceNoticeEmailData extends CampaignRecipient {
  signInUrl: string;
  siteHost: string;
  readjustmentUrl: string;
  supportWhatsAppDisplay: string;
  supportWhatsAppUrl: string;
}

export const CAMPAIGN_CONSENT_NOTE =
  "You're getting this because you agreed to hear from Mpillow when you shopped with us.";

export const SERVICE_NOTICE_NOTE =
  "A one-time service notice for people who have shopped with Mpillow. It is not marketing.";

const greet = (firstName: string | null) => {
  const name = firstName?.replace(/\s+/g, " ").trim();
  return name ? `Hi ${name},` : "Hi,";
};

export function claimBonusPhrase(b: Pick<CampaignBonusTerms, "points" | "amount">): string {
  return `${b.points}, ${b.amount} off your next shop order`;
}

export const BONUS_TERMS =
  "Use them at checkout on any shop order, up to half the products' price. They can't be used on custom pillows, and points used are not refunded.";

const TERMS_LINK = "How points work";
const termsHtml = (termsUrl: string) => paragraphHtml(link({ href: termsUrl, label: TERMS_LINK }), { muted: true });

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
    `${TERMS_LINK}: ${p.termsUrl}`,
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
    bodyHtml: `${paragraph(greeting)}
${paragraph(news)}
${button({ href: p.claimUrl, label: "Sign in to your account" })}
${heading("Points for signing in", 2, { top: 24 })}
${paragraph(offer)}
${paragraph(BONUS_TERMS, { muted: true })}
${termsHtml(p.termsUrl)}
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
    `${TERMS_LINK}: ${p.termsUrl}`,
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
${paragraph(BONUS_TERMS, { muted: true })}
${termsHtml(p.termsUrl)}`,
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
