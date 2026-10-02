/**
 * What a reply to a Google review may look like, checked the same way whether
 * Claude drafted it or a review manager typed it in Telegram.
 *
 * Google moderates owner replies and can reject ones that read as promotional:
 * links, phone numbers, discounts and incentives. These checks do not block a
 * post — a person decides — but the card shows them before anyone taps Post.
 */

/** Long enough for any sensible reply; keeps a whole card under Telegram's 4096. */
export const MAX_REPLY_CHARS = 1500;

const CHECKS: { pattern: RegExp; warning: string }[] = [
  {
    pattern: /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|sg|net|org|co|io|my)\b)/i,
    warning: "Contains a link or web address — Google may reject replies with links.",
  },
  {
    pattern: /(\+?\d[\d\s-]{6,}\d)/,
    warning: "Contains a phone number — Google may reject it; invite them to contact us instead.",
  },
  {
    pattern: /[\w.+-]+@[\w-]+\.[\w.]+/,
    warning: "Contains an email address — keep contact details out of public replies.",
  },
  {
    pattern: /\b(discount|promo(tion)?s?|vouchers?|coupons?|\d+\s?% off|free gifts?|cashback)\b/i,
    warning: "Mentions a discount or incentive — Google treats that as a policy violation.",
  },
  {
    // Service-recovery replies are where this creeps in. Make it right in
    // private; a public promise reads as an incentive and sets a precedent.
    pattern: /\b(refund(s|ed)?|reimburs\w*|compensat\w*|complimentary|free of charge|on the house)\b/i,
    warning: "Promises a refund or compensation in public — settle that privately instead.",
  },
];

export function replyWarnings(text: string): string[] {
  return CHECKS.filter((c) => c.pattern.test(text)).map((c) => c.warning);
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
