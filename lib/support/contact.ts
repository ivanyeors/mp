import { contactRecipients, sendContactMessage, type ContactMessage } from "@/lib/email/contact";
import { sendGroupMessage } from "@/lib/telegram/bot-api";

/**
 * Where a Contact Us message goes (the "Get in touch" form on /support).
 *
 * Two copies, email first:
 *  - the email to the support inbox (SUPPORT_EMAIL), with the customer and
 *    sg@mpillow.com on Cc. Staff answer from it, the customer keeps it as
 *    their copy, and it is the record that stays.
 *  - a notice in the staff Telegram group, so somebody sees the message within
 *    minutes rather than whenever the inbox is next opened. It says whether
 *    the email went, so nobody goes looking for an email that never arrived.
 *
 * One landing is enough. The customer is told it failed only when neither did,
 * because only then does nobody have the message.
 */

export const CONTACT_NOTICE_HEADER = "✉️ CONTACT US · mpillow website";

/**
 * The message's share of a notice. Name, email and subject are capped by the
 * form (200 + 320 + 200), so this keeps the whole notice under Telegram's
 * 4096 characters; a longer notice is never delivered.
 */
const MAX_NOTICE_MESSAGE_CHARS = 2700;

/** The Telegram notice. Plain text — no parse_mode, nothing to escape. */
export function renderContactNotice(msg: ContactMessage, emailed: boolean): string {
  const { to, cc } = contactRecipients(msg.email);
  const copied = cc.map((address) => (address === msg.email ? "the customer" : address)).join(" and ");
  const subject = msg.subject?.trim();
  const message = msg.message.trim();
  const body =
    message.length <= MAX_NOTICE_MESSAGE_CHARS
      ? message
      : `${message.slice(0, MAX_NOTICE_MESSAGE_CHARS).trimEnd()}… (cut short${emailed ? "; the email has all of it" : ""})`;
  return [
    CONTACT_NOTICE_HEADER,
    `${msg.name} · ${msg.email}`,
    ...(subject ? [`Subject: ${subject}`] : []),
    "",
    body,
    "",
    emailed
      ? `Emailed to ${to}, cc ${copied}. Reply to that email and it reaches the customer.`
      : `⚠️ The email to ${to} failed, so the customer has no copy either. Reply to ${msg.email} directly.`,
  ].join("\n");
}

export type ContactDelivery = { emailed: boolean; notified: boolean };

/** Sends both copies. Never throws: the result says which landed. */
export async function deliverContactMessage(msg: ContactMessage): Promise<ContactDelivery> {
  let emailed = false;
  try {
    await sendContactMessage(msg);
    emailed = true;
  } catch (err) {
    console.error("[support/contact] email failed:", err instanceof Error ? err.message : err);
  }
  const notice = await sendGroupMessage(renderContactNotice(msg, emailed));
  if (!notice.ok) console.error("[support/contact] telegram failed:", notice.error);
  return { emailed, notified: notice.ok };
}
