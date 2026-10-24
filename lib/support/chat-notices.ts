/**
 * What the website chat posts in the staff Telegram group. Plain text: no
 * parse_mode, nothing to escape. Every line names the chat by its short ref,
 * so staff can tell two chats apart in the group.
 */

export const CHAT_NOTICE_HEADER = "💬 WEBSITE CHAT";

/** Telegram refuses a message over 4096 characters; leave room for the lines around the body. */
const MAX_ROOT_BODY_CHARS = 3000;

export type ChatNoticeSubject = {
  id: string;
  name: string | null;
  /** Always verified: the account's sign-in email, or one proved with a chat code. */
  email: string;
  auth_user_id: string | null;
};

/** The short reference staff and the customer both see, e.g. "3F9A2C". */
export function chatRef(id: string): string {
  return id.replace(/[^0-9a-z]/gi, "").slice(0, 6).toUpperCase();
}

function who(chat: ChatNoticeSubject): string {
  return `${chat.name?.trim() || "Visitor"} · ${chat.email}${chat.auth_user_id ? " · has an account" : ""}`;
}

/**
 * The chat's first notice. Normally one message; several when the first
 * attempt to reach Telegram failed and a later message is posting the root.
 */
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

/** A later customer message, threaded under the root. */
export function renderChatFollowUp(chat: ChatNoticeSubject, body: string): string {
  return `💬 #${chatRef(chat.id)} · ${chat.name?.trim() || "Visitor"}\n${body.trim()}`;
}

export function renderChatEndedNote(chat: ChatNoticeSubject, emailed: boolean): string {
  const ref = `#${chatRef(chat.id)}`;
  if (emailed) return `✅ ${ref}: the customer ended the chat. The transcript went to ${chat.email}.`;
  return `✅ ${ref}: the customer ended the chat.`;
}

/** Where a staff reply went, when the customer wasn't on the page to see it. */
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
