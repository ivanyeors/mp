import { MP_CONFIG_TELEGRAM_CHAT_ID } from "@/lib/telegram/notify";
import { reactInGroup, replyInGroup } from "@/lib/telegram/bot-api";
import {
  chatIdForTelegramMessage,
  emailTranscriptIfNew,
  isCustomerPresent,
  isLatestStaffMessage,
  loadChat,
  recordStaffReply,
} from "./chat";
import { renderStaffReplyOutcome, type StaffReplyDelivery } from "./chat-notices";

/**
 * The website chat's half of the Telegram bot: a staff member replies, in the
 * measurements group, to any message of a chat, and the reply goes to the
 * customer's chat on the website.
 *
 * Anyone in the group may answer: it is the staff group, and the chat's
 * messages only ever post there (MP_CONFIG_TELEGRAM_CHAT_ID is hardcoded).
 *
 * When the customer is on the page the reply gets a 👍 and nothing else. When
 * they have gone, the handler waits a moment (a second message may follow, or
 * they may come back), then emails the whole chat once and says in the group
 * where the reply went.
 */

type TelegramUser = { id: number; is_bot?: boolean; first_name?: string };

export type ChatTelegramUpdate = {
  message?: {
    message_id: number;
    chat: { id: number };
    from?: TelegramUser;
    text?: string;
    caption?: string;
    reply_to_message?: { message_id: number };
  };
};

/** How long a reply to an absent customer waits for a follow-up before the email goes. */
export const STAFF_REPLY_SETTLE_MS = 20_000;

function messageText(message: NonNullable<ChatTelegramUpdate["message"]>): string {
  return (message.text ?? message.caption ?? "").trim();
}

/**
 * Could this be a staff reply to a chat? Cheap: no I/O. A reply in the
 * measurements group that isn't a command; the handler looks up whether the
 * message it answers belongs to a chat.
 */
export function isChatReplyCandidate(update: ChatTelegramUpdate): boolean {
  const message = update.message;
  if (!message || message.chat.id !== MP_CONFIG_TELEGRAM_CHAT_ID) return false;
  if (!message.reply_to_message || message.from?.is_bot) return false;
  return !messageText(message).startsWith("/");
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Does the work for an update `isChatReplyCandidate` accepted. Never throws. */
export async function handleChatReplyUpdate(
  update: ChatTelegramUpdate,
  opts: { settleMs?: number; wait?: (ms: number) => Promise<void> } = {},
): Promise<void> {
  const message = update.message;
  const replyTo = message?.reply_to_message?.message_id;
  if (!message || !replyTo) return;
  try {
    const body = messageText(message);
    if (!body) {
      // A photo or sticker: say so, but only under a chat's message.
      if (await chatIdForTelegramMessage(replyTo)) {
        await replyInGroup("Only text reaches the website chat. Send your reply as a text message.", message.message_id);
      }
      return;
    }

    const result = await recordStaffReply({
      replyToTelegramId: replyTo,
      telegramMessageId: message.message_id,
      staffName: message.from?.first_name ?? null,
      body,
    });
    if (result.kind !== "recorded") return;
    if (result.present) {
      await reactInGroup(message.message_id, "👍");
      return;
    }

    await (opts.wait ?? sleep)(opts.settleMs ?? STAFF_REPLY_SETTLE_MS);
    // A later reply in the same chat sends the email and reports for both.
    if (!(await isLatestStaffMessage(result.chat.id, result.message.id))) return;
    const chat = await loadChat(result.chat.id);
    if (!chat) return;
    if (isCustomerPresent(chat)) {
      await reactInGroup(message.message_id, "👍");
      return;
    }

    let delivery: StaffReplyDelivery;
    if (chat.email) {
      // `nothing_new`: another trigger (they left the page meanwhile) already sent it.
      const sent = await emailTranscriptIfNew(chat.id, "staff_reply");
      delivery = sent === "sent" || sent === "nothing_new" ? "emailed" : "email_failed";
    } else {
      delivery = chat.auth_user_id ? "saved_to_account" : "unreachable";
    }
    await replyInGroup(renderStaffReplyOutcome(chat, delivery), message.message_id);
  } catch (error) {
    console.error("[support/chat] telegram reply failed", error);
  }
}
