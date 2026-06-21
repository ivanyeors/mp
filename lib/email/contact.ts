import { getEmailTransport } from "./index";
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

  const html = `<!doctype html>
<html>
<body style="margin:0;background:#f6f6f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;">
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <div style="background:#fff;border:1px solid #eee;border-radius:12px;padding:28px;">
      <h1 style="font-size:20px;margin:0 0 12px;">New support message</h1>
      <p style="margin:0 0 4px;color:#444;"><strong>From:</strong> ${escapeHtml(msg.name)} &lt;${escapeHtml(msg.email)}&gt;</p>
      ${msg.subject ? `<p style="margin:0 0 12px;color:#444;"><strong>Subject:</strong> ${escapeHtml(msg.subject)}</p>` : ""}
      <p style="white-space:pre-wrap;color:#111;line-height:1.5;margin-top:16px;">${escapeHtml(msg.message)}</p>
    </div>
    <p style="color:#999;font-size:12px;text-align:center;margin-top:16px;">mpillow support</p>
  </div>
</body>
</html>`;

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
