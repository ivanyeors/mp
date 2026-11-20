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

export const STAFF_REPLY_SETTLE_MS = 20_000;

function messageText(message: NonNullable<ChatTelegramUpdate["message"]>): string {
  return (message.text ?? message.caption ?? "").trim();
}

export function isChatReplyCandidate(update: ChatTelegramUpdate): boolean {
  const message = update.message;
  if (!message || message.chat.id !== MP_CONFIG_TELEGRAM_CHAT_ID) return false;
  if (!message.reply_to_message || message.from?.is_bot) return false;
  return !messageText(message).startsWith("/");
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
    if (!(await isLatestStaffMessage(result.chat.id, result.message.id))) return;
    const chat = await loadChat(result.chat.id);
    if (!chat) return;
    if (isCustomerPresent(chat)) {
      await reactInGroup(message.message_id, "👍");
      return;
    }

    const sent = await emailTranscriptIfNew(chat.id, "staff_reply");
    const delivery: StaffReplyDelivery = sent === "sent" || sent === "nothing_new" ? "emailed" : "email_failed";
    await replyInGroup(renderStaffReplyOutcome(chat, delivery), message.message_id);
  } catch (error) {
    console.error("[support/chat] telegram reply failed", error);
  }
}
