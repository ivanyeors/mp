import { MP_CONFIG_TELEGRAM_CHAT_ID } from "@/lib/telegram/notify";

const TELEGRAM_TIMEOUT_MS = 5_000;

export type InlineKeyboardButton = { text: string } & (
  | { callback_data: string; url?: never }
  | { url: string; callback_data?: never }
);
export type InlineKeyboardMarkup = { inline_keyboard: InlineKeyboardButton[][] };

type TelegramResponse<T> = { ok: boolean; result?: T; description?: string };

async function callTelegram<T>(
  method: string,
  payload: Record<string, unknown>,
  timeoutMs = TELEGRAM_TIMEOUT_MS,
): Promise<{ ok: true; result: T } | { ok: false; error: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN is not set" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
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

function replyTo(messageId: number | null | undefined) {
  return messageId ? { reply_parameters: { message_id: messageId, allow_sending_without_reply: true } } : {};
}

export async function sendGroupMessage(
  text: string,
  replyMarkup?: InlineKeyboardMarkup,
  opts: { replyToMessageId?: number | null } = {},
): Promise<{ ok: true; chatId: number; messageId: number } | { ok: false; error: string }> {
  const res = await callTelegram<{ message_id: number }>("sendMessage", {
    chat_id: MP_CONFIG_TELEGRAM_CHAT_ID,
    text,
    reply_markup: replyMarkup,
    link_preview_options: { is_disabled: true },
    ...replyTo(opts.replyToMessageId),
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, chatId: MP_CONFIG_TELEGRAM_CHAT_ID, messageId: res.result.message_id };
}

const PHOTO_TIMEOUT_MS = 20_000;

export async function sendGroupPhoto(
  photoUrl: string,
  caption: string,
  opts: { replyToMessageId?: number | null } = {},
): Promise<{ ok: true; chatId: number; messageId: number } | { ok: false; error: string }> {
  const res = await callTelegram<{ message_id: number }>(
    "sendPhoto",
    { chat_id: MP_CONFIG_TELEGRAM_CHAT_ID, photo: photoUrl, caption, ...replyTo(opts.replyToMessageId) },
    PHOTO_TIMEOUT_MS,
  );
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, chatId: MP_CONFIG_TELEGRAM_CHAT_ID, messageId: res.result.message_id };
}

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

export async function deleteGroupMessage(messageId: number): Promise<boolean> {
  const res = await callTelegram("deleteMessage", { chat_id: MP_CONFIG_TELEGRAM_CHAT_ID, message_id: messageId });
  if (!res.ok) console.error("[telegram] delete card failed", res.error);
  return res.ok;
}

export async function replyInGroup(text: string, replyToMessageId?: number): Promise<number | null> {
  const res = await callTelegram<{ message_id: number }>("sendMessage", {
    chat_id: MP_CONFIG_TELEGRAM_CHAT_ID,
    text,
    link_preview_options: { is_disabled: true },
    ...replyTo(replyToMessageId),
  });
  return res.ok ? res.result.message_id : null;
}

export async function replyInChat(chatId: number, text: string, replyToMessageId?: number): Promise<void> {
  await callTelegram("sendMessage", { chat_id: chatId, text, ...replyTo(replyToMessageId) });
}

export async function reactInGroup(messageId: number, emoji: string): Promise<boolean> {
  const res = await callTelegram("setMessageReaction", {
    chat_id: MP_CONFIG_TELEGRAM_CHAT_ID,
    message_id: messageId,
    reaction: [{ type: "emoji", emoji }],
  });
  if (!res.ok) console.error("[telegram] reaction failed", res.error);
  return res.ok;
}

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
