export const CHAT_NOTICE_HEADER = "💬 WEBSITE CHAT";

const MAX_ROOT_BODY_CHARS = 3000;

export type ChatNoticeSubject = {
  id: string;
  name: string | null;
  email: string;
  auth_user_id: string | null;
};

export function chatRef(id: string): string {
  return id.replace(/[^0-9a-z]/gi, "").slice(0, 6).toUpperCase();
}

function who(chat: ChatNoticeSubject): string {
  return `${chat.name?.trim() || "Visitor"} · ${chat.email}${chat.auth_user_id ? " · has an account" : ""}`;
}

export function renderChatRootNotice(chat: ChatNoticeSubject, bodies: string[]): string {
  let body = bodies.map((b) => b.trim()).join("\n\n");
  if (body.length > MAX_ROOT_BODY_CHARS) body = `${body.slice(0, MAX_ROOT_BODY_CHARS).trimEnd()}… (cut short)`;
  return [
    `${CHAT_NOTICE_HEADER} #${chatRef(chat.id)}`,
    who(chat),
    "",
    body,
    "",
    "↩️ Reply to this message, or to any later one from this chat, and the customer sees it on the website.",
  ].join("\n");
}

export function renderChatFollowUp(chat: ChatNoticeSubject, body: string): string {
  return `💬 #${chatRef(chat.id)} · ${chat.name?.trim() || "Visitor"}\n${body.trim()}`;
}

export function renderChatEndedNote(chat: ChatNoticeSubject, emailed: boolean): string {
  const ref = `#${chatRef(chat.id)}`;
  if (emailed) return `✅ ${ref}: the customer ended the chat. The transcript went to ${chat.email}.`;
  return `✅ ${ref}: the customer ended the chat.`;
}

export type StaffReplyDelivery = "emailed" | "email_failed";

export function renderStaffReplyOutcome(chat: ChatNoticeSubject & { status: string }, delivery: StaffReplyDelivery): string {
  const gone = chat.status === "ended" ? "This chat has ended" : "They've left the page";
  switch (delivery) {
    case "emailed":
      return `📧 ${gone}, so your reply went to ${chat.email} with the whole chat.`;
    case "email_failed":
      return `⚠️ ${gone} and the email to ${chat.email} failed. Reply to them by email directly.`;
  }
}
