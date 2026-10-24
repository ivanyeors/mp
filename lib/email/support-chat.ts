import { getEmailTransport } from "./index";
import { renderEmailShell } from "./base";
import { card, mutedText, paragraph, preformatted } from "./components";
import { CONTACT_CC, getSupportInbox, uniqueAddresses } from "./contact";
import { getDefaultFromAddress } from "./transport";
import { getSiteOrigin } from "@/lib/site-url";
import type { RenderedEmail, SendOutcome } from "./types";

// ============================================================
// Website chat → transcript email
// ============================================================
//
// A visitor who gives the chat an email gets the whole conversation there:
// when they end the chat, when they leave the page, and when a staff reply
// arrives after they have gone (lib/support/chat.ts decides when). Every
// transcript of one chat has the same subject, so the mail client threads
// them.

/** Why this transcript is going out; only the opening line differs. */
export type TranscriptReason = "ended" | "left" | "staff_reply";

export interface TranscriptMessage {
  sender: "customer" | "staff";
  body: string;
  staffName?: string | null;
  createdAt: string;
}

export interface ChatTranscript {
  /** The short chat reference staff see in Telegram, e.g. "3F9A2C". */
  ref: string;
  chatId: string;
  name?: string | null;
  email: string;
  /** Signed in: the email links back to the chat in their account. */
  hasAccount: boolean;
  messages: TranscriptMessage[];
  reason: TranscriptReason;
}

/**
 * To the customer, with the support inbox and CONTACT_CC on Cc, so staff keep
 * the record and anyone can answer from their inbox. Reply-To names the inbox
 * and the customer, so a reply from either side reaches both.
 */
export function chatTranscriptRecipients(customerEmail: string): { to: string; cc: string[]; replyTo: string[] } {
  const support = getSupportInbox();
  const cc = uniqueAddresses([customerEmail, support, CONTACT_CC]).slice(1);
  return { to: customerEmail, cc, replyTo: uniqueAddresses([support, customerEmail]) };
}

const TIME = new Intl.DateTimeFormat("en-SG", {
  timeZone: "Asia/Singapore",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : TIME.format(d);
}

function speaker(m: TranscriptMessage): string {
  return m.sender === "customer" ? "You" : `${m.staffName?.trim() || "mpillow"} (mpillow team)`;
}

const OPENING: Record<TranscriptReason, string> = {
  ended: "Here's a copy of your chat with us.",
  left: "Here's a copy of your chat with us so far. If we reply after you've left the page, we'll email you the reply.",
  staff_reply: "We've replied to your chat. Here's the whole conversation.",
};

export function renderChatTranscriptEmail(t: ChatTranscript): RenderedEmail {
  const greeting = t.name?.trim() ? `Hi ${t.name.trim()},` : "Hi,";
  const opening = OPENING[t.reason];
  const replyNote = "Reply to this email and it reaches our team.";
  const notYou = "Didn't chat with us? Someone entered your email address in the chat on our website. You can ignore this email.";
  const chatUrl = `${getSiteOrigin()}/support?chat=${encodeURIComponent(t.chatId)}#contact`;

  const text = `${greeting}

${opening}

${t.messages.map((m) => `${speaker(m)} · ${when(m.createdAt)}\n${m.body}`).join("\n\n")}

${replyNote}${t.hasAccount ? `\nYour chat: ${chatUrl}` : ""}

${notYou}`;

  const bodyHtml = `${paragraph(greeting)}
${paragraph(opening)}
${t.messages
  .map((m) =>
    card({
      tone: m.sender === "customer" ? "muted" : "outline",
      padding: 16,
      bodyHtml: `${paragraph(`${speaker(m)} · ${when(m.createdAt)}`, { muted: true, bottom: 6 })}${preformatted(m.body)}`,
    }),
  )
  .join("\n")}
${paragraph(replyNote, { top: 8 })}
${mutedText(notYou)}`;

  const html = renderEmailShell({
    title: "Your chat with mpillow",
    preheader:
      t.reason === "staff_reply"
        ? "We've replied to your chat on our website."
        : "A copy of your chat with the mpillow team.",
    bodyHtml,
    footer: "mpillow support",
    audience: "customer",
    ...(t.hasAccount ? { cta: { href: chatUrl, label: "Open your chat" } } : {}),
  });

  return { subject: `Your chat with mpillow (#${t.ref})`, html, text };
}

/** Sends one transcript. Throws if the transport throws. */
export async function sendChatTranscript(t: ChatTranscript): Promise<SendOutcome> {
  const transport = getEmailTransport();
  const result = await transport.send({
    ...renderChatTranscriptEmail(t),
    ...chatTranscriptRecipients(t.email),
    from: getDefaultFromAddress(),
  });
  return { sent: true, transport: transport.name, id: result.id };
}
