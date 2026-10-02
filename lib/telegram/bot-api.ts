import { MP_CONFIG_TELEGRAM_CHAT_ID } from "@/lib/telegram/notify";

/**
 * Interactive Telegram messages for the measurements group: review cards with
 * inline buttons, edits when a card changes state, and callback answers.
 *
 * Sends are pinned to MP_CONFIG_TELEGRAM_CHAT_ID for the same reason
 * notify.ts pins it: a misconfigured env var must not be able to redirect
 * customer reviews into some other chat. Like notify.ts, nothing here throws —
 * a Telegram outage must not fail the work that triggered the message.
 */

const TELEGRAM_TIMEOUT_MS = 5_000;

export type InlineKeyboardButton = { text: string; callback_data: string };
export type InlineKeyboardMarkup = { inline_keyboard: InlineKeyboardButton[][] };

type TelegramResponse<T> = { ok: boolean; result?: T; description?: string };

async function callTelegram<T>(
  method: string,
  payload: Record<string, unknown>,
): Promise<{ ok: true; result: T } | { ok: false; error: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN is not set" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => null)) as TelegramResponse<T> | null;
    if (!res.ok || !json?.ok) {
      return { ok: false, error: json?.description ?? `Telegram ${method} failed (${res.status})` };
    }
    return { ok: true, result: json.result as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : `Telegram ${method} failed` };
  }
}

/** Posts a message to the measurements group, reporting why when it can't. */
export async function sendGroupMessage(
  text: string,
  replyMarkup?: InlineKeyboardMarkup,
): Promise<{ ok: true; chatId: number; messageId: number } | { ok: false; error: string }> {
  const res = await callTelegram<{ message_id: number }>("sendMessage", {
    chat_id: MP_CONFIG_TELEGRAM_CHAT_ID,
    text,
    reply_markup: replyMarkup,
    link_preview_options: { is_disabled: true },
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, chatId: MP_CONFIG_TELEGRAM_CHAT_ID, messageId: res.result.message_id };
}

/** Posts a card to the measurements group. Returns the message id, or null. */
export async function sendGroupCard(
  text: string,
  replyMarkup?: InlineKeyboardMarkup,
): Promise<{ chatId: number; messageId: number } | null> {
  const res = await sendGroupMessage(text, replyMarkup);
  if (!res.ok) {
    console.error("[telegram] send card failed", res.error);
    return null;
  }
  return { chatId: res.chatId, messageId: res.messageId };
}

/**
 * Rewrites a card in place. Omitting `replyMarkup` removes the buttons — a
 * card that has been acted on must not stay tappable. "Not modified" is
 * success: the card already says what we wanted it to say.
 */
export async function editGroupCard(
  messageId: number,
  text: string,
  replyMarkup?: InlineKeyboardMarkup,
): Promise<boolean> {
  const res = await callTelegram("editMessageText", {
    chat_id: MP_CONFIG_TELEGRAM_CHAT_ID,
    message_id: messageId,
    text,
    reply_markup: replyMarkup ?? { inline_keyboard: [] },
    link_preview_options: { is_disabled: true },
  });
  if (!res.ok && !/message is not modified/i.test(res.error)) {
    console.error("[telegram] edit card failed", res.error);
    return false;
  }
  return true;
}

/** A short threaded reply in the group, e.g. confirming a staff edit. */
export async function replyInGroup(text: string, replyToMessageId?: number): Promise<void> {
  await callTelegram("sendMessage", {
    chat_id: MP_CONFIG_TELEGRAM_CHAT_ID,
    text,
    ...(replyToMessageId
      ? { reply_parameters: { message_id: replyToMessageId, allow_sending_without_reply: true } }
      : {}),
  });
}

/** A direct reply in whatever chat the person wrote from (used for /link). */
export async function replyInChat(chatId: number, text: string, replyToMessageId?: number): Promise<void> {
  await callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    ...(replyToMessageId
      ? { reply_parameters: { message_id: replyToMessageId, allow_sending_without_reply: true } }
      : {}),
  });
}

/** Stops the button spinner; `showAlert` pops a dialog only the tapper sees. */
export async function answerCallback(
  callbackQueryId: string,
  text?: string,
  showAlert = false,
): Promise<void> {
  await callTelegram("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text: text.slice(0, 200), show_alert: showAlert } : {}),
  });
}
