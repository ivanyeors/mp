import { getEmailTransport } from "./index";
import { renderEmailShell } from "./base";
import { card, infoList, preformatted } from "./components";
import { getDefaultFromAddress } from "./transport";
import type { RenderedEmail, SendOutcome } from "./types";

// ============================================================
// Support contact form → email
// ============================================================
//
// A customer-facing contact form delivers a message to the support inbox. We
// reuse the same swappable transport as the order emails, so this works with
// Resend in production and falls back to the console transport in dev.

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

export function renderContactEmail(msg: ContactMessage): RenderedEmail {
  const subjectLine = msg.subject?.trim()
    ? `Support: ${msg.subject.trim()}`
    : "New support message";

  const text = `New message from the support form

Name: ${msg.name}
Email: ${msg.email}
${msg.subject ? `Subject: ${msg.subject}\n` : ""}
Message:
${msg.message}`;

  const bodyHtml = `${infoList([
    { label: "From", value: msg.name },
    { label: "Email", value: msg.email },
    ...(msg.subject?.trim() ? [{ label: "Subject", value: msg.subject.trim() }] : []),
  ])}
${card({ bodyHtml: preformatted(msg.message) })}`;

  const html = renderEmailShell({
    title: "New support message",
    preheader: `${msg.name} sent a message through the support form.`,
    bodyHtml,
    footer: "mpillow support",
    audience: "staff",
  });

  return { subject: subjectLine, html, text };
}

/**
 * Send a contact-form message to the support inbox. The sender's address is set
 * as Reply-To so staff can reply directly. Throws if the transport throws.
 */
export async function sendContactMessage(msg: ContactMessage): Promise<SendOutcome> {
  const transport = getEmailTransport();
  const rendered = renderContactEmail(msg);
  const result = await transport.send({
    ...rendered,
    to: getSupportInbox(),
    from: getDefaultFromAddress(),
    replyTo: msg.email,
  });
  return { sent: true, transport: transport.name, id: result.id };
}
