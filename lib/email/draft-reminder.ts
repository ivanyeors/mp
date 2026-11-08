// ============================================================
// Draft reminder (ADR 0050)
// ============================================================
//
// A guest who gave their email on the configurator's first question and then
// stopped gets up to three of these: 1 day, 1 week and 1 month after they last
// saved. Each carries one button, the Draft's continue link, which reopens
// their answers on any device.
//
// It is about something they started, not something they bought, so it goes
// only to people with Marketing consent (the box on the first question, ticked
// by default) and is sent like a campaign: an Unsubscribe link in the footer
// and `List-Unsubscribe` on the send (lib/draft-reminders/server.ts). A guest
// has no account to turn it off in, so the footer link is how they stop it.
//
// Staff can reword it under Email templates. What stays in code: the one
// button and its link, the reason line, and the Unsubscribe link.

import { renderEmailShell } from "./base";
import { button, divider, link, paragraph, paragraphHtml } from "./components";
import { defaultEmailCopy, defineEmailCopy, fillCopy, type EmailCopy } from "./copy";
import { escapeHtml } from "./html";
import type { RenderedEmail } from "./types";

/** Which of the three reminders this is. */
export type DraftReminderStep = "1d" | "1w" | "1m";

/** Why they are getting it. Fixed: it is what makes the email solicited. */
export const DRAFT_REMINDER_FOOTER =
  "You're getting this because you started customising a pillow with Mpillow and agreed to emails from us. We send three reminders at most.";

const WHATSAPP_HINT = "Keep {whatsapp_number}: it becomes the link to WhatsApp.";

export const DRAFT_REMINDER_EMAIL_COPY = defineEmailCopy({
  id: "results.draft_reminder",
  name: "Finish your pillow reminder",
  description:
    "Sent to a guest who gave their email on the configurator's first question and stopped before paying: 1 day, 1 week and 1 month after they last saved, with a link back to their answers. Only to people with Marketing consent.",
  placeholders: {
    first_name: "The name they gave on the first question, e.g. Wei Ling (empty when we have none)",
    product: "The pillow they were customising: Mpillow or Basic Mpillow",
    whatsapp_number: "Our staffed WhatsApp number, e.g. +65 8780 5311, shown as a link to WhatsApp",
  },
  fields: {
    subject_1d: { label: "Subject", default: "Your {product} answers are saved", group: "1 day after" },
    message_1d: {
      label: "Message",
      default:
        "You started customising your {product}. Your answers are saved, so you can pick up where you left off, on any device.",
      group: "1 day after",
    },
    subject_1w: { label: "Subject", default: "Still thinking about your {product}?", group: "1 week after" },
    message_1w: {
      label: "Message",
      default: "Your answers for your {product} are still saved. Pick up where you left off whenever you're ready.",
      group: "1 week after",
    },
    subject_1m: { label: "Subject", default: "Your {product} answers are still here", group: "1 month after" },
    message_1m: {
      label: "Message",
      default:
        "It's been a month since you started customising your {product}. Your answers are still saved if you'd like to finish. This is the last reminder we'll send about it.",
      hint: "The last one: say so, since no fourth is sent.",
      group: "1 month after",
    },
    preheader: { label: "Inbox preview line", default: "Pick up where you left off, on any device." },
    heading: { label: "Heading", default: "Pick up where you left off" },
    greeting: { label: "Greeting", default: "Hi {first_name},", group: "With a name" },
    greeting_no_name: { label: "Greeting", default: "Hi,", group: "No name on file" },
    button: {
      label: "Button",
      default: "Continue your pillow",
      hint: "The one button: it opens their saved answers.",
    },
    contact: {
      label: "After the button",
      default: "Questions about sizing or fit? Message us on WhatsApp at {whatsapp_number}, or just reply to this email.",
      hint: WHATSAPP_HINT,
    },
  },
});

type DraftReminderField = keyof typeof DRAFT_REMINDER_EMAIL_COPY.fields;

export interface DraftReminderEmailData {
  step: DraftReminderStep;
  /** The name they typed on the first question; null when blank. */
  name: string | null;
  /** "Mpillow", or "Basic Mpillow" for a Draft started in /mp-basic. */
  product: string;
  /** The Draft's continue link (lib/configurator/continue-draft.ts). */
  continueUrl: string;
  /** Their unsubscribe page (lib/marketing-consent/unsubscribe.ts). */
  unsubscribeUrl: string;
  supportWhatsAppDisplay: string;
  supportWhatsAppUrl: string;
}

/** The contact line, with the WhatsApp number in it as the link. */
function contactHtml(contact: string, p: DraftReminderEmailData): string {
  return escapeHtml(contact).replace(
    escapeHtml(p.supportWhatsAppDisplay),
    link({ href: p.supportWhatsAppUrl, label: p.supportWhatsAppDisplay }),
  );
}

export function renderDraftReminderEmail(
  p: DraftReminderEmailData,
  copy: EmailCopy<DraftReminderField> = defaultEmailCopy(DRAFT_REMINDER_EMAIL_COPY),
): RenderedEmail {
  const name = p.name?.replace(/\s+/g, " ").trim() || null;
  const values = {
    first_name: name ?? "",
    product: p.product,
    whatsapp_number: p.supportWhatsAppDisplay,
  };
  const t = (key: DraftReminderField) => fillCopy(copy[key], values);
  const greeting = name ? t("greeting") : t("greeting_no_name");
  const message = t(`message_${p.step}`);

  const text = [
    greeting,
    "",
    message,
    "",
    `${t("button")}: ${p.continueUrl}`,
    "",
    t("contact"),
    `WhatsApp: ${p.supportWhatsAppUrl}`,
    "",
    DRAFT_REMINDER_FOOTER,
    `Unsubscribe: ${p.unsubscribeUrl}`,
  ].join("\n");

  const html = renderEmailShell({
    title: t("heading"),
    preheader: t("preheader"),
    bodyHtml: `${paragraph(greeting)}
${paragraph(message)}
${button({ href: p.continueUrl, label: t("button") })}
${paragraphHtml(contactHtml(t("contact"), p), { top: 20, muted: true })}
${divider()}
${paragraph(DRAFT_REMINDER_FOOTER, { muted: true })}`,
    unsubscribeUrl: p.unsubscribeUrl,
  });

  return { subject: t(`subject_${p.step}`), html, text };
}
