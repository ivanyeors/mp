import { getEmailTransport } from "./index";
import { renderEmailShell } from "./base";
import { emailAddressOf } from "./campaign-transport";
import { card, infoList, mutedText, paragraph, preformatted } from "./components";
import { getDefaultFromAddress } from "./transport";
import type { RenderedEmail, SendOutcome } from "./types";

// ============================================================
// Support contact form → email
// ============================================================
//
// The Contact Us form emails the support inbox, with the customer and
// CONTACT_CC on Cc: one email, so staff and the customer share one thread and
// the customer keeps a copy of what they sent. It goes through the same
// swappable transport as the order emails (the Gmail mailbox in production,
// the console transport in dev).

export interface ContactMessage {
  name: string;
  email: string;
  subject?: string | null;
  message: string;
}

/**
 * Where contact-form messages are delivered. Defaults to the configured
 * from-address (i.e. your own inbox) when SUPPORT_EMAIL is not set, so the
 * form never silently drops messages.
 */
export function getSupportInbox(): string {
  return process.env.SUPPORT_EMAIL || getDefaultFromAddress();
}

/** A second staff inbox copied on every Contact Us message. */
export const CONTACT_CC = "sg@mpillow.com";

/** Each address once, compared without case or display name; the first spelling wins. */
function uniqueAddresses(list: string[]): string[] {
  const seen = new Set<string>();
  return list.filter((address) => {
    const key = emailAddressOf(address) ?? address.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Who a Contact Us message is addressed to. Reply-To names both the support
 * inbox and the customer, so a reply reaches both whoever presses it: staff
 * answering, or the customer adding something (with only their own address
 * there, their reply would go to themselves).
 */
export function contactRecipients(customerEmail: string): { to: string; cc: string[]; replyTo: string[] } {
  const to = getSupportInbox();
  // `to` is first, so it is always kept; a customer who typed a staff address isn't copied twice.
  const cc = uniqueAddresses([to, customerEmail, CONTACT_CC]).slice(1);
  return { to, cc, replyTo: uniqueAddresses([to, customerEmail]) };
}

/** Read by staff and by the customer on Cc, so it is written to the customer. */
export function renderContactEmail(msg: ContactMessage): RenderedEmail {
  const subject = msg.subject?.trim();
  const subjectLine = subject ? `Contact Us: ${subject}` : `Contact Us: message from ${msg.name}`;
  const intro = `Hi ${msg.name}, this is a copy of the message you sent through the Contact Us form on our website. We'll reply to this email as soon as we can.`;
  const notYou = "Didn't send this? Someone entered your email address on our Contact Us form. You can ignore this email.";

  const text = `Thanks for getting in touch

${intro}

Name: ${msg.name}
Email: ${msg.email}
${subject ? `Subject: ${subject}\n` : ""}
Message:
${msg.message}

${notYou}`;

  const bodyHtml = `${paragraph(intro)}
${infoList([
    { label: "From", value: msg.name },
    { label: "Email", value: msg.email },
    ...(subject ? [{ label: "Subject", value: subject }] : []),
  ])}
${card({ bodyHtml: preformatted(msg.message) })}
${mutedText(notYou)}`;

  const html = renderEmailShell({
    title: "Thanks for getting in touch",
    preheader: `A copy of the message ${msg.name} sent through the Contact Us form.`,
    bodyHtml,
    footer: "mpillow support",
    audience: "customer",
  });

  return { subject: subjectLine, html, text };
}

/**
 * Send a Contact Us message to the support inbox, with the customer and
 * CONTACT_CC on Cc (see contactRecipients). Throws if the transport throws.
 */
export async function sendContactMessage(msg: ContactMessage): Promise<SendOutcome> {
  const transport = getEmailTransport();
  const rendered = renderContactEmail(msg);
  const result = await transport.send({
    ...rendered,
    ...contactRecipients(msg.email),
    from: getDefaultFromAddress(),
  });
  return { sent: true, transport: transport.name, id: result.id };
}
