import { getEmailTransport } from "./index";
import { renderEmailShell } from "./base";
import { card, codeBlock, mutedText, paragraph, preformatted } from "./components";
import { CONTACT_CC, getSupportInbox, uniqueAddresses } from "./contact";
import { getDefaultFromAddress } from "./transport";
import { getSiteOrigin } from "@/lib/site-url";
import type { RenderedEmail, SendOutcome } from "./types";

export function renderChatCodeEmail(p: { code: string; minutes?: number }): RenderedEmail {
  const minutes = p.minutes ?? 10;
  const intro = "Here's your code for the chat on our website.";
  const expiry = `Enter it in the chat to send your message. It works for ${minutes} minutes.`;
  const after = "We'll email you a copy of the chat at this address when you're done, and any reply we send after you've left the page.";
  const notYou = "Didn't start a chat with us? Someone typed your email address in the chat on our website. You can ignore this email: without the code, we send nothing else.";

  const text = `${intro}

${p.code}

${expiry}

${after}

${notYou}`;

  const html = renderEmailShell({
    title: "Your chat code",
    preheader: `Your code is ${p.code}. It works for ${minutes} minutes.`,
    bodyHtml: `${paragraph(intro)}
${codeBlock(p.code, { caption: expiry })}
${paragraph(after)}
${mutedText(notYou)}`,
    footer: "mpillow support",
    audience: "customer",
  });

  return { subject: "Your mpillow chat code", html, text };
}

export async function sendChatCodeEmail(email: string, code: string, minutes?: number): Promise<SendOutcome> {
  const transport = getEmailTransport();
  const result = await transport.send({
    ...renderChatCodeEmail({ code, minutes }),
    to: email,
    from: getDefaultFromAddress(),
  });
  return { sent: true, transport: transport.name, id: result.id };
}

export type TranscriptReason = "ended" | "left" | "staff_reply";

export interface TranscriptMessage {
  sender: "customer" | "staff";
  body: string;
  staffName?: string | null;
  createdAt: string;
}

export interface ChatTranscript {
  ref: string;
  chatId: string;
  name?: string | null;
  email: string;
  hasAccount: boolean;
  messages: TranscriptMessage[];
  reason: TranscriptReason;
}

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
  const chatUrl = `${getSiteOrigin()}/support?chat=${encodeURIComponent(t.chatId)}#contact`;

  const text = `${greeting}

${opening}

${t.messages.map((m) => `${speaker(m)} · ${when(m.createdAt)}\n${m.body}`).join("\n\n")}

${replyNote}${t.hasAccount ? `\nYour chat: ${chatUrl}` : ""}`;

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
${paragraph(replyNote, { top: 8 })}`;

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

export async function sendChatTranscript(t: ChatTranscript): Promise<SendOutcome> {
  const transport = getEmailTransport();
  const result = await transport.send({
    ...renderChatTranscriptEmail(t),
    ...chatTranscriptRecipients(t.email),
    from: getDefaultFromAddress(),
  });
  return { sent: true, transport: transport.name, id: result.id };
}
