import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { escapeLikePattern } from "@/lib/supabase/like-pattern";
import { sendChatTranscript, type TranscriptReason } from "@/lib/email/support-chat";
import { replyInGroup, sendGroupMessage } from "@/lib/telegram/bot-api";
import {
  chatRef,
  renderChatClaimNote,
  renderChatContactNote,
  renderChatEndedNote,
  renderChatFollowUp,
  renderChatRootNotice,
} from "./chat-notices";

/**
 * The website chat (the "Get in touch" chat on /support).
 *
 * A visitor starts a chat; each message is stored here and posted to the staff
 * Telegram group, threaded under the chat's first notice. A staff member's
 * Telegram reply to any of those is stored as a `staff` message
 * (lib/support/chat-telegram.ts), and the visitor's page picks it up by
 * polling.
 *
 * Who can open a chat: whoever holds its token (the browser that started it,
 * in sessionStorage — so without an account it is gone with the tab), and the
 * signed-in customer it belongs to, from anywhere.
 *
 * A chat with an email gets its transcript emailed when the customer ends it,
 * when they leave the page (and don't come straight back), and when a staff
 * reply arrives after they've gone. Each transcript is the whole chat, and only
 * goes when there is something it hasn't sent yet.
 *
 * Telegram and email are best-effort: nothing here throws because either is
 * down. The stored chat is the record.
 */

export const CHAT_MESSAGE_MAX_CHARS = 2000;
export const STAFF_MESSAGE_MAX_CHARS = 4000;
/** A runaway chat stops taking messages; the customer starts a new one. */
export const CHAT_MAX_MESSAGES = 200;
/** The page polls every few seconds while open (slower in a background tab). */
export const PRESENCE_WINDOW_MS = 90_000;
/** Polls write `last_seen_at` at most this often, unless the page had left. */
const TOUCH_EVERY_MS = 20_000;

export type SupportChatRow = {
  id: string;
  token_hash: string;
  customer_id: string | null;
  auth_user_id: string | null;
  name: string | null;
  email: string | null;
  status: "open" | "ended";
  preview: string;
  telegram_root_message_id: number | null;
  created_at: string;
  last_message_at: string;
  last_seen_at: string | null;
  left_at: string | null;
  ended_at: string | null;
  transcript_emailed_at: string | null;
  transcript_message_count: number;
};

const CHAT_COLUMNS =
  "id,token_hash,customer_id,auth_user_id,name,email,status,preview,telegram_root_message_id,created_at,last_message_at,last_seen_at,left_at,ended_at,transcript_emailed_at,transcript_message_count";
const MESSAGE_COLUMNS = "id,chat_id,sender,body,staff_name,telegram_message_id,created_at";

export type ChatMessageView = {
  id: string;
  sender: "customer" | "staff";
  body: string;
  staffName: string | null;
  createdAt: string;
};

/** What the visitor's page is told about a chat. Never the token hash. */
export type ChatView = {
  id: string;
  ref: string;
  status: "open" | "ended";
  name: string | null;
  email: string | null;
  hasAccount: boolean;
  createdAt: string;
  endedAt: string | null;
};

export type ChatSummary = ChatView & { preview: string; lastMessageAt: string };

/** The signed-in customer a chat is started by, claimed by, or adopted into. */
export type ChatCustomer = { customerId: string; authUserId: string; email: string; name: string | null };

type MessageRow = {
  id: number | string;
  chat_id: string;
  sender: "customer" | "staff";
  body: string;
  staff_name: string | null;
  telegram_message_id: number | null;
  created_at: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function hashChatToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newChatToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashChatToken(token) };
}

export type ChatAccess = { token?: string | null; authUserId?: string | null };

/** The token's holder, or the signed-in customer the chat belongs to. */
export function canAccessChat(chat: Pick<SupportChatRow, "token_hash" | "auth_user_id">, access: ChatAccess): boolean {
  if (access.authUserId && chat.auth_user_id === access.authUserId) return true;
  if (!access.token) return false;
  const given = Buffer.from(hashChatToken(access.token), "hex");
  const stored = Buffer.from(chat.token_hash, "hex");
  return given.length === stored.length && timingSafeEqual(given, stored);
}

export function toChatView(chat: SupportChatRow): ChatView {
  return {
    id: chat.id,
    ref: chatRef(chat.id),
    status: chat.status,
    name: chat.name,
    email: chat.email,
    hasAccount: chat.auth_user_id !== null,
    createdAt: chat.created_at,
    endedAt: chat.ended_at,
  };
}

function toMessageView(row: MessageRow): ChatMessageView {
  return {
    id: String(row.id),
    sender: row.sender,
    body: row.body,
    staffName: row.staff_name,
    createdAt: row.created_at,
  };
}

/** The customer is on the chat's page right now, so a staff reply is seen there. */
export function isCustomerPresent(chat: SupportChatRow, now: Date = new Date()): boolean {
  if (chat.status !== "open" || chat.left_at || !chat.last_seen_at) return false;
  return now.getTime() - Date.parse(chat.last_seen_at) < PRESENCE_WINDOW_MS;
}

export async function loadChat(id: string): Promise<SupportChatRow | null> {
  if (!UUID.test(id)) return null;
  const { data, error } = await supabaseAdmin().from("support_chats").select(CHAT_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`support chat read failed: ${error.message}`);
  return (data as SupportChatRow | null) ?? null;
}

export async function readMessages(chatId: string): Promise<ChatMessageView[]> {
  const { data, error } = await supabaseAdmin()
    .from("support_chat_messages")
    .select(MESSAGE_COLUMNS)
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error(`support chat messages read failed: ${error.message}`);
  return ((data ?? []) as MessageRow[]).map(toMessageView);
}

/** Messages are never deleted, so the count is also the page's poll version. */
export async function countMessages(chatId: string): Promise<number> {
  const { count, error } = await supabaseAdmin()
    .from("support_chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("chat_id", chatId);
  if (error) throw new Error(`support chat count failed: ${error.message}`);
  return count ?? 0;
}

async function updateChat(id: string, patch: Partial<SupportChatRow>): Promise<SupportChatRow> {
  const { data, error } = await supabaseAdmin()
    .from("support_chats")
    .update(patch)
    .eq("id", id)
    .select(CHAT_COLUMNS)
    .single();
  if (error) throw new Error(`support chat update failed: ${error.message}`);
  return data as SupportChatRow;
}

async function insertMessage(row: Omit<MessageRow, "id">): Promise<MessageRow> {
  const { data, error } = await supabaseAdmin()
    .from("support_chat_messages")
    .insert(row)
    .select(MESSAGE_COLUMNS)
    .single();
  if (error) {
    const err = new Error(`support chat message insert failed: ${error.message}`) as Error & { code?: string };
    err.code = (error as { code?: string }).code;
    throw err;
  }
  return data as MessageRow;
}

async function setTelegramId(messageId: number | string, telegramMessageId: number): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("support_chat_messages")
    .update({ telegram_message_id: telegramMessageId })
    .eq("id", messageId);
  if (error) console.error("[support/chat] storing the Telegram id failed:", error.message);
}

/**
 * Posts a customer message to the group: under the chat's root notice, or as
 * the root when there is none yet (the first message, or every earlier attempt
 * failed — then the root carries all of them). Returns the new root id, if any.
 */
async function postCustomerMessage(
  chat: SupportChatRow,
  message: MessageRow,
): Promise<{ delivered: boolean; rootId: number | null }> {
  let text: string;
  if (chat.telegram_root_message_id) {
    text = renderChatFollowUp(chat, message.body);
  } else {
    const earlier = (await readMessages(chat.id)).filter((m) => m.sender === "customer").map((m) => m.body);
    text = renderChatRootNotice(chat, earlier.length ? earlier : [message.body]);
  }
  const sent = await sendGroupMessage(text, undefined, {
    replyToMessageId: chat.telegram_root_message_id ?? undefined,
  });
  if (!sent.ok) {
    console.error("[support/chat] telegram failed:", sent.error);
    return { delivered: false, rootId: null };
  }
  await setTelegramId(message.id, sent.messageId);
  return { delivered: true, rootId: chat.telegram_root_message_id ? null : sent.messageId };
}

/** A one-line note under the chat's root; skipped when the chat never reached Telegram. */
async function noteInGroup(chat: SupportChatRow, text: string): Promise<void> {
  if (!chat.telegram_root_message_id) return;
  await replyInGroup(text, chat.telegram_root_message_id);
}

function clean(value: string | null | undefined, max: number): string | null {
  const v = value?.trim();
  return v ? v.slice(0, max) : null;
}

export async function startChat(input: {
  body: string;
  name?: string | null;
  email?: string | null;
  customer?: ChatCustomer | null;
  now?: Date;
}): Promise<{ chat: SupportChatRow; token: string; message: ChatMessageView; delivered: boolean }> {
  const now = (input.now ?? new Date()).toISOString();
  const body = input.body.trim().slice(0, CHAT_MESSAGE_MAX_CHARS);
  const { token, tokenHash } = newChatToken();
  const customer = input.customer ?? null;

  const { data, error } = await supabaseAdmin()
    .from("support_chats")
    .insert({
      id: randomUUID(),
      token_hash: tokenHash,
      customer_id: customer?.customerId ?? null,
      auth_user_id: customer?.authUserId ?? null,
      name: clean(input.name, 200) ?? customer?.name ?? null,
      email: customer?.email ?? clean(input.email, 320),
      status: "open",
      preview: body.replace(/\s+/g, " ").slice(0, 200),
      telegram_root_message_id: null,
      created_at: now,
      last_message_at: now,
      last_seen_at: now,
      left_at: null,
      ended_at: null,
      transcript_emailed_at: null,
      transcript_message_count: 0,
    })
    .select(CHAT_COLUMNS)
    .single();
  if (error) throw new Error(`support chat insert failed: ${error.message}`);
  let chat = data as SupportChatRow;

  const message = await insertMessage({
    chat_id: chat.id,
    sender: "customer",
    body,
    staff_name: null,
    telegram_message_id: null,
    created_at: now,
  });
  const { delivered, rootId } = await postCustomerMessage(chat, message);
  if (rootId) chat = await updateChat(chat.id, { telegram_root_message_id: rootId });
  return { chat, token, message: toMessageView(message), delivered };
}

export type AddMessageResult =
  | { ok: true; chat: SupportChatRow; message: ChatMessageView; delivered: boolean }
  | { ok: false; reason: "ended" | "full" };

export async function addCustomerMessage(chat: SupportChatRow, text: string, now: Date = new Date()): Promise<AddMessageResult> {
  if (chat.status === "ended") return { ok: false, reason: "ended" };
  if ((await countMessages(chat.id)) >= CHAT_MAX_MESSAGES) return { ok: false, reason: "full" };
  const at = now.toISOString();
  const message = await insertMessage({
    chat_id: chat.id,
    sender: "customer",
    body: text.trim().slice(0, CHAT_MESSAGE_MAX_CHARS),
    staff_name: null,
    telegram_message_id: null,
    created_at: at,
  });
  const { delivered, rootId } = await postCustomerMessage(chat, message);
  const updated = await updateChat(chat.id, {
    last_message_at: at,
    last_seen_at: at,
    left_at: null,
    ...(rootId ? { telegram_root_message_id: rootId } : {}),
  });
  return { ok: true, chat: updated, message: toMessageView(message), delivered };
}

/** The visitor gave (or changed) their email and name. */
export async function setChatContact(
  chat: SupportChatRow,
  contact: { email: string; name?: string | null },
): Promise<SupportChatRow> {
  const email = contact.email.trim().slice(0, 320);
  const name = clean(contact.name, 200) ?? chat.name;
  if (email.toLowerCase() === chat.email?.toLowerCase() && name === chat.name) return chat;
  const updated = await updateChat(chat.id, { email, name });
  await noteInGroup(updated, renderChatContactNote(updated));
  return updated;
}

/** A poll: the customer is on the page. Writes at most every TOUCH_EVERY_MS. */
export async function touchChat(chat: SupportChatRow, now: Date = new Date()): Promise<SupportChatRow> {
  const stale = !chat.last_seen_at || now.getTime() - Date.parse(chat.last_seen_at) >= TOUCH_EVERY_MS;
  if (!chat.left_at && !stale) return chat;
  return updateChat(chat.id, { last_seen_at: now.toISOString(), left_at: null });
}

/** The page's pagehide beacon. settleLeave decides, a little later, whether they really went. */
export async function markChatLeft(chat: SupportChatRow, now: Date = new Date()): Promise<SupportChatRow> {
  if (chat.status === "ended") return chat;
  return updateChat(chat.id, { left_at: now.toISOString() });
}

/** How long a reload has to poll again before leaving counts as leaving. */
export const LEAVE_SETTLE_MS = 15_000;

/**
 * After the beacon: a reload polls within seconds and clears `left_at`, so a
 * chat still marked left really was left, and gets its transcript.
 */
export async function settleLeave(chatId: string): Promise<TranscriptResult> {
  const chat = await loadChat(chatId);
  if (!chat || !chat.left_at || chat.status === "ended") return "skipped";
  return emailTranscriptIfNew(chatId, "left");
}

export type TranscriptResult = "sent" | "nothing_new" | "no_email" | "failed" | "skipped";

/**
 * Emails the whole chat when it has messages the last transcript didn't
 * cover. Claims the send first (a conditional update on the count it last
 * covered), so two triggers at once send one email.
 */
export async function emailTranscriptIfNew(chatId: string, reason: TranscriptReason): Promise<TranscriptResult> {
  try {
    const chat = await loadChat(chatId);
    if (!chat) return "skipped";
    if (!chat.email) return "no_email";
    const messages = await readMessages(chatId);
    const covered = chat.transcript_message_count;
    if (messages.length <= covered) return "nothing_new";

    const { data: claimed, error } = await supabaseAdmin()
      .from("support_chats")
      .update({ transcript_message_count: messages.length, transcript_emailed_at: new Date().toISOString() })
      .eq("id", chatId)
      .eq("transcript_message_count", covered)
      .select("id");
    if (error) throw new Error(error.message);
    if (!claimed?.length) return "nothing_new";

    try {
      await sendChatTranscript({
        ref: chatRef(chat.id),
        chatId: chat.id,
        name: chat.name,
        email: chat.email,
        hasAccount: chat.auth_user_id !== null,
        messages,
        reason,
      });
      return "sent";
    } catch (err) {
      console.error("[support/chat] transcript email failed:", err instanceof Error ? err.message : err);
      // Give the claim back, so the next trigger tries again.
      await supabaseAdmin()
        .from("support_chats")
        .update({ transcript_message_count: covered })
        .eq("id", chatId)
        .eq("transcript_message_count", messages.length);
      return "failed";
    }
  } catch (err) {
    console.error("[support/chat] transcript failed:", err instanceof Error ? err.message : err);
    return "failed";
  }
}

export async function endChat(chat: SupportChatRow, now: Date = new Date()): Promise<{ chat: SupportChatRow; emailed: boolean }> {
  if (chat.status === "ended") return { chat, emailed: false };
  const ended = await updateChat(chat.id, { status: "ended", ended_at: now.toISOString(), left_at: null });
  const emailed = (await emailTranscriptIfNew(chat.id, "ended")) === "sent";
  await noteInGroup(ended, renderChatEndedNote(ended, emailed));
  return { chat: ended, emailed };
}

/**
 * The visitor signed in from the chat (or was already, on another chat): the
 * chat moves into their account, under the account's email. A chat already in
 * another account stays where it is.
 */
export async function claimChat(chat: SupportChatRow, customer: ChatCustomer): Promise<SupportChatRow | null> {
  if (chat.auth_user_id === customer.authUserId) return chat;
  if (chat.auth_user_id) return null;
  const claimed = await updateChat(chat.id, {
    customer_id: customer.customerId,
    auth_user_id: customer.authUserId,
    email: customer.email,
    name: chat.name ?? customer.name,
  });
  await noteInGroup(claimed, renderChatClaimNote(claimed));
  return claimed;
}

/**
 * A signed-in customer's chats, newest first. Chats nobody owns that carry
 * their verified sign-in email are adopted first: their transcripts already
 * went to that address, so showing them in the account reveals nothing new.
 */
export async function listCustomerChats(customer: ChatCustomer, limit = 30): Promise<ChatSummary[]> {
  const admin = supabaseAdmin();
  const { error: adoptError } = await admin
    .from("support_chats")
    .update({ customer_id: customer.customerId, auth_user_id: customer.authUserId })
    .is("auth_user_id", null)
    .ilike("email", escapeLikePattern(customer.email));
  if (adoptError) console.error("[support/chat] adopting chats failed:", adoptError.message);

  const { data, error } = await admin
    .from("support_chats")
    .select(CHAT_COLUMNS)
    .eq("auth_user_id", customer.authUserId)
    .order("last_message_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`support chat list failed: ${error.message}`);
  return ((data ?? []) as SupportChatRow[]).map((chat) => ({
    ...toChatView(chat),
    preview: chat.preview,
    lastMessageAt: chat.last_message_at,
  }));
}

/** The chat a group message belongs to, if it is one of a chat's messages. */
export async function chatIdForTelegramMessage(telegramMessageId: number): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .from("support_chat_messages")
    .select("chat_id")
    .eq("telegram_message_id", telegramMessageId)
    .maybeSingle();
  if (error) throw new Error(`support chat lookup failed: ${error.message}`);
  return (data as { chat_id: string } | null)?.chat_id ?? null;
}

export type StaffReplyResult =
  | { kind: "not_a_chat" }
  | { kind: "duplicate" }
  | { kind: "recorded"; chat: SupportChatRow; message: ChatMessageView; present: boolean };

/**
 * A staff member replied in Telegram to one of a chat's messages: store it as
 * the chat's next message. `present` says whether the customer is on the page
 * to see it; the caller emails it otherwise.
 */
export async function recordStaffReply(input: {
  replyToTelegramId: number;
  telegramMessageId: number;
  staffName: string | null;
  body: string;
  now?: Date;
}): Promise<StaffReplyResult> {
  const now = input.now ?? new Date();
  const chatId = await chatIdForTelegramMessage(input.replyToTelegramId);
  if (!chatId) return { kind: "not_a_chat" };
  const chat = await loadChat(chatId);
  if (!chat) return { kind: "not_a_chat" };

  const at = now.toISOString();
  let message: MessageRow;
  try {
    message = await insertMessage({
      chat_id: chat.id,
      sender: "staff",
      body: input.body.trim().slice(0, STAFF_MESSAGE_MAX_CHARS),
      staff_name: clean(input.staffName, 100),
      telegram_message_id: input.telegramMessageId,
      created_at: at,
    });
  } catch (err) {
    // Telegram redelivers an update it thinks failed; the unique Telegram id makes that a no-op.
    if ((err as { code?: string }).code === "23505") return { kind: "duplicate" };
    throw err;
  }
  const updated = await updateChat(chat.id, { last_message_at: at });
  return { kind: "recorded", chat: updated, message: toMessageView(message), present: isCustomerPresent(chat, now) };
}

/** Is this still the chat's latest staff message? Later ones send the email instead. */
export async function isLatestStaffMessage(chatId: string, messageId: string): Promise<boolean> {
  const messages = await readMessages(chatId);
  const latest = messages.filter((m) => m.sender === "staff").at(-1);
  return latest?.id === messageId;
}
