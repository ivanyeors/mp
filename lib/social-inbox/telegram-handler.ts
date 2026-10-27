import { MP_CONFIG_TELEGRAM_CHAT_ID } from "@/lib/telegram/notify";
import { replyInGroup } from "@/lib/telegram/bot-api";
import { authorizeTelegramAction, type TelegramDenial } from "@/lib/telegram/operators";
import { describeActions } from "@/lib/telegram/roles";
import { TEAM_NOTE_PREFIX } from "@/lib/reviews/cards";
import { inboxPreviewPlatform, isInboxBotText, renderSentNote } from "@/lib/social-inbox/cards";
import {
  PLATFORM_APPS,
  PLATFORM_NAMES,
  checkOutgoingText,
  humanAgentEnabled,
  replyWindow,
} from "@/lib/social-inbox/platforms";
import { sendToCustomer } from "@/lib/social-inbox/send";
import {
  getConversation,
  getMessageByCard,
  insertMessage,
  updateConversation,
  updateMessage,
} from "@/lib/social-inbox/store";

/**
 * The inbox half of the Telegram bot: a reply to a customer's Message card (or
 * to the bot's "Sent" / "Answered in" notes under it) is sent to that customer
 * on the platform they wrote from.
 *
 * - Only in the measurements group, only from a linked Staff profile whose
 *   Telegram link and login's role both grant Answer customer messages
 *   (`telegram.social-inbox-reply`, Users & permissions → Telegram and → Roles).
 * - A reply that starts with `//` is a team note and is never sent.
 * - Anyone else who replies is told it was NOT sent — a silent no would leave
 *   them thinking the customer got their answer.
 * - The reply window is checked before sending; past it, the platform would
 *   refuse, so we say where to answer instead.
 */

type TelegramUser = { id: number; username?: string; first_name?: string; last_name?: string };

export type InboxTelegramUpdate = {
  message?: {
    message_id: number;
    chat: { id: number };
    from?: TelegramUser;
    text?: string;
    caption?: string;
    reply_to_message?: { message_id: number; text?: string; caption?: string };
  };
};

/** Does this update belong to the inbox? Cheap: no I/O. Commands stay with the inventory bot. */
export function isInboxUpdate(update: InboxTelegramUpdate): boolean {
  const message = update.message;
  const replied = message?.reply_to_message;
  if (!message || !replied || message.chat.id !== MP_CONFIG_TELEGRAM_CHAT_ID) return false;
  // A `//` team note is not a command: claimed here, so the inventory bot never answers it.
  const text = message.text?.trim() ?? "";
  if (text.startsWith("/") && !text.startsWith(TEAM_NOTE_PREFIX)) return false;
  return isInboxBotText(replied.text ?? replied.caption);
}

/** Why a reply was not sent: always says so, since a silent no reads as answered. */
function deniedMessage(reason: TelegramDenial, user: TelegramUser, roleName?: string): string {
  switch (reason) {
    case "inactive":
      return "Not sent — your Telegram access is switched off. Ask an admin to turn it back on.";
    case "profile_archived":
      return "Not sent — your staff profile is archived, so your Telegram access is off. Ask an admin if this is a mistake.";
    case "member_inactive":
      return "Not sent — your Admin Panel login is deactivated, so your Telegram access is off. Ask an admin if this is a mistake.";
    case "member_invited":
      return "Not sent — your Admin Panel login hasn't been accepted yet. Sign in to the Admin Panel once with the invited email, then try again.";
    case "role_forbidden":
      return `Not sent — your login's role${roleName ? ` (${roleName})` : ""} doesn't include "answer customer messages". Ask an Owner to turn it on under Users & permissions → Roles.`;
    case "forbidden":
      return `Not sent — your Telegram access doesn't include "answer customer messages". Ask an admin to turn it on under Users & permissions → Telegram.`;
    case "not_linked":
      return `Not sent — you're not set up to answer customers yet. Ask an admin to link your staff profile under Settings → Users & permissions → Telegram, then send /link with your code. (Your Telegram ID: ${user.id}) To talk to the team under a card, start with ${TEAM_NOTE_PREFIX}.`;
  }
}

async function authorize(user: TelegramUser) {
  const auth = await authorizeTelegramAction(user.id, "telegram.social-inbox-reply");
  if (auth.ok) return { ok: true as const, name: auth.name, actions: auth.actions };
  return { ok: false as const, message: deniedMessage(auth.reason, user, auth.roleName) };
}

async function handleReply(message: NonNullable<InboxTelegramUpdate["message"]>, now: Date): Promise<void> {
  const from = message.from;
  const replied = message.reply_to_message;
  if (!from || !replied) return;
  const text = message.text?.trim() ?? "";
  if (text.startsWith(TEAM_NOTE_PREFIX)) return;
  const say = (reply: string) => replyInGroup(reply, message.message_id);

  // A preview card (Users & permissions → Telegram → Send preview): show what a
  // reply would do, and the replier's access. Nothing is sent.
  const previewPlatform = inboxPreviewPlatform(replied.text ?? replied.caption);
  if (previewPlatform) {
    const auth = await authorize(from);
    await say(
      auth.ok
        ? `🧪 On a real card, this reply would be sent to the customer on ${PLATFORM_NAMES[previewPlatform]}. You're set up as ${auth.name} (${describeActions(auth.actions)}).`
        : auth.message,
    );
    return;
  }

  const card = await getMessageByCard(message.chat.id, replied.message_id);
  if (!card) return;
  const conversation = await getConversation(card.conversation_id);
  if (!conversation) return;
  const platform = PLATFORM_NAMES[conversation.platform];

  if (!text) {
    await say(`Not sent — only text goes to customers from here. Send photos and files from ${PLATFORM_APPS[conversation.platform]}.`);
    return;
  }

  const auth = await authorize(from);
  if (!auth.ok) {
    await say(auth.message);
    return;
  }

  const window = replyWindow(conversation.platform, conversation.last_inbound_at, now, { humanAgent: humanAgentEnabled() });
  if (!window.ok) {
    await say(`❌ Not sent — ${window.message}`);
    return;
  }
  const length = checkOutgoingText(conversation.platform, text);
  if (!length.ok) {
    await say(`❌ Not sent — ${length.message}`);
    return;
  }

  const outbound = await insertMessage({
    conversation_id: conversation.id,
    platform: conversation.platform,
    direction: "outbound",
    source: "telegram",
    external_message_id: null,
    body: text,
    attachments: [],
    sent_at: now.toISOString(),
    status: "sending",
    sent_by_telegram_user_id: from.id,
    sent_by_name: auth.name,
    telegram_chat_id: message.chat.id,
    telegram_source_message_id: message.message_id,
  });
  // Telegram delivered this update twice; the first one is sending it.
  if (!outbound) return;

  const result = await sendToCustomer(conversation, text, window.tag);
  if (!result.ok) {
    await updateMessage(outbound.id, { status: "failed", error: result.error }, "sending");
    await say(`❌ Not sent — ${platform} said: ${result.error}`);
    return;
  }

  try {
    await updateMessage(outbound.id, { status: "sent", error: null, external_message_id: result.messageId }, "sending");
  } catch {
    // The echo was stored first under the same id; the send itself succeeded.
    await updateMessage(outbound.id, { status: "sent", error: null }, "sending");
  }
  await updateConversation(conversation.id, { last_outbound_at: now.toISOString() });
  const noteId = await say(
    renderSentNote(
      conversation.platform,
      { displayName: conversation.display_name, username: conversation.username },
      auth.name,
    ),
  );
  if (noteId) await updateMessage(outbound.id, { telegram_message_id: noteId });
}

/** Does the work for an update `isInboxUpdate` accepted. Never throws. */
export async function handleInboxUpdate(update: InboxTelegramUpdate, now = new Date()): Promise<void> {
  const message = update.message;
  if (!message) return;
  try {
    await handleReply(message, now);
  } catch (error) {
    console.error("[social-inbox] telegram reply failed", error);
    await replyInGroup(
      "❌ Something went wrong — the reply may or may not have reached the customer. Check the conversation in the platform's app before sending it again.",
      message.message_id,
    );
  }
}
