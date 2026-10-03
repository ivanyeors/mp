import { SUPPORT_WHATSAPP_DIGITS, SUPPORT_WHATSAPP_DISPLAY } from "@/lib/contact";
import type { ReplyStyle } from "@/lib/reviews/reply-style";

/**
 * What a reply to a Google review may look like, checked the same way whether
 * Claude drafted it or a review manager typed it in Telegram.
 *
 * Google moderates owner replies and can reject ones that read as promotional:
 * links, phone numbers, discounts and incentives. These checks do not block a
 * post — a person decides — but the card shows them before anyone taps Post.
 *
 * One number is expected rather than flagged: the staffed WhatsApp support
 * line (lib/contact.ts), which every service-recovery reply must give.
 */

/** Long enough for any sensible reply; keeps a whole card under Telegram's 4096. */
export const MAX_REPLY_CHARS = 1500;

const PHONE = /\+?\d[\d\s-]{6,}\d/g;

function phoneNumbers(text: string): string[] {
  return text.match(PHONE) ?? [];
}

/** The staffed WhatsApp line, written with or without +65 and in any spacing. */
function isSupportWhatsApp(candidate: string): boolean {
  const digits = candidate.replace(/\D/g, "");
  const national = SUPPORT_WHATSAPP_DIGITS.startsWith("65") ? SUPPORT_WHATSAPP_DIGITS.slice(2) : null;
  return digits === SUPPORT_WHATSAPP_DIGITS || digits === national;
}

export function mentionsSupportWhatsApp(text: string): boolean {
  return phoneNumbers(text).some(isSupportWhatsApp);
}

const CHECKS: { test: (text: string) => boolean; warning: string }[] = [
  {
    test: (t) => /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|sg|net|org|co|io|my)\b)/i.test(t),
    warning: "Contains a link or web address — Google may reject replies with links.",
  },
  {
    // Includes the automated appointment line: nobody reads messages sent to it.
    test: (t) => phoneNumbers(t).some((n) => !isSupportWhatsApp(n)),
    warning: `Contains a phone number other than our WhatsApp support line (${SUPPORT_WHATSAPP_DISPLAY}) — Google may reject it.`,
  },
  {
    test: (t) => /[\w.+-]+@[\w-]+\.[\w.]+/.test(t),
    warning: "Contains an email address — keep contact details out of public replies.",
  },
  {
    test: (t) => /\b(discount|promo(tion)?s?|vouchers?|coupons?|\d+\s?% off|free gifts?|cashback)\b/i.test(t),
    warning: "Mentions a discount or incentive — Google treats that as a policy violation.",
  },
  {
    // Service-recovery replies are where this creeps in. Make it right in
    // private; a public promise reads as an incentive and sets a precedent.
    test: (t) => /\b(refund(s|ed)?|reimburs\w*|compensat\w*|complimentary|free of charge|on the house)\b/i.test(t),
    warning: "Promises a refund or compensation in public — settle that privately instead.",
  },
];

/**
 * Warnings for a reply. With the review's reply type, a service-recovery reply
 * that does not send the customer to our WhatsApp line is flagged too.
 */
export function replyWarnings(text: string, opts?: { style?: ReplyStyle }): string[] {
  const warnings = CHECKS.filter((c) => c.test(text)).map((c) => c.warning);
  if (opts?.style === "service_recovery" && !mentionsSupportWhatsApp(text)) {
    warnings.push(
      `Doesn't ask them to WhatsApp us on ${SUPPORT_WHATSAPP_DISPLAY} — every service-recovery reply should.`,
    );
  }
  return warnings;
}

/** Trims, and strips the wrapping quotes models and people both like to add. */
export function normalizeReplyText(raw: string): string {
  let text = raw.replace(/\r\n/g, "\n").trim();
  const quoted = /^(["“”'])([\s\S]*)(["“”'])$/.exec(text);
  if (quoted && quoted[2].trim() && !/["“”]/.test(quoted[2])) text = quoted[2].trim();
  return text;
}

export type ReplyCheck = { ok: true; text: string } | { ok: false; error: string };

export function checkReplyText(raw: string): ReplyCheck {
  const text = normalizeReplyText(raw);
  if (!text) return { ok: false, error: "The reply is empty." };
  if (text.length > MAX_REPLY_CHARS) {
    return { ok: false, error: `The reply is ${text.length} characters; keep it under ${MAX_REPLY_CHARS}.` };
  }
  return { ok: true, text };
}
