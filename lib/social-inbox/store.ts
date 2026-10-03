import { supabaseAdmin } from "@/lib/supabase/server";
import type { SocialPlatform } from "@/lib/social-inbox/platforms";
import type { InboundAttachment } from "@/lib/social-inbox/types";

/** `social_conversations` / `social_messages` row shapes and the reads shared by ingest and Telegram. */

export type SocialConversationRow = {
  id: string;
  platform: SocialPlatform;
  external_id: string;
  display_name: string | null;
  username: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  last_card_chat_id: number | null;
  last_card_message_id: number | null;
  profile_checked_at: string | null;
  created_at: string;
  updated_at: string;
};

export const CONVERSATION_COLUMNS =
  "id,platform,external_id,display_name,username,last_inbound_at,last_outbound_at,last_card_chat_id,last_card_message_id,profile_checked_at,created_at,updated_at";

export type SocialMessageStatus = "new" | "carding" | "carded" | "sending" | "sent" | "failed" | "recorded";

export type SocialMessageRow = {
  id: string;
  conversation_id: string;
  platform: SocialPlatform;
  direction: "inbound" | "outbound";
  source: "customer" | "telegram" | "platform_app";
  external_message_id: string | null;
  body: string | null;
  attachments: InboundAttachment[];
  sent_at: string;
  status: SocialMessageStatus;
  error: string | null;
  unsent_at: string | null;
  sent_by_telegram_user_id: number | null;
  sent_by_name: string | null;
  telegram_chat_id: number | null;
  telegram_message_id: number | null;
  telegram_source_message_id: number | null;
  created_at: string;
  updated_at: string;
};

export const MESSAGE_COLUMNS =
  "id,conversation_id,platform,direction,source,external_message_id,body,attachments,sent_at,status,error,unsent_at,sent_by_telegram_user_id,sent_by_name,telegram_chat_id,telegram_message_id,telegram_source_message_id,created_at,updated_at";

export async function getConversation(id: string): Promise<SocialConversationRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("social_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SocialConversationRow | null) ?? null;
}

/** The conversation for (platform, external id), created on first sight. */
export async function ensureConversation(platform: SocialPlatform, externalId: string): Promise<SocialConversationRow> {
  const admin = supabaseAdmin();
  const { error: upsertError } = await admin
    .from("social_conversations")
    .upsert({ platform, external_id: externalId }, { onConflict: "platform,external_id", ignoreDuplicates: true });
  if (upsertError) throw new Error(upsertError.message);
  const { data, error } = await admin
    .from("social_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("platform", platform)
    .eq("external_id", externalId)
    .maybeSingle();
  if (error || !data) throw new Error(error?.message ?? "conversation not found after upsert");
  return data as SocialConversationRow;
}

export async function updateConversation(
  id: string,
  patch: Partial<Omit<SocialConversationRow, "id" | "platform" | "external_id" | "created_at" | "updated_at">>,
): Promise<void> {
  const { error } = await supabaseAdmin().from("social_conversations").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getMessageByExternalId(
  platform: SocialPlatform,
  externalMessageId: string,
): Promise<SocialMessageRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("social_messages")
    .select(MESSAGE_COLUMNS)
    .eq("platform", platform)
    .eq("external_message_id", externalMessageId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SocialMessageRow | null) ?? null;
}

/** The row a bot message in the group was posted for — how a staff reply finds its conversation. */
export async function getMessageByCard(chatId: number, messageId: number): Promise<SocialMessageRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("social_messages")
    .select(MESSAGE_COLUMNS)
    .eq("telegram_chat_id", chatId)
    .eq("telegram_message_id", messageId)
    .limit(1);
  if (error) throw new Error(error.message);
  return ((data ?? [])[0] as SocialMessageRow | undefined) ?? null;
}

/**
 * Inserts a message unless (platform, external id) — or, for a staff reply,
 * (chat, Telegram source message) — is already stored. Null means duplicate:
 * a webhook or Telegram update delivered twice.
 */
export async function insertMessage(
  row: Omit<
    SocialMessageRow,
    "id" | "created_at" | "updated_at" | "error" | "unsent_at" | "telegram_chat_id" | "telegram_message_id"
  > &
    Partial<Pick<SocialMessageRow, "telegram_chat_id" | "telegram_message_id">>,
): Promise<SocialMessageRow | null> {
  const onConflict =
    row.telegram_source_message_id != null ? "telegram_chat_id,telegram_source_message_id" : "platform,external_message_id";
  const { data, error } = await supabaseAdmin()
    .from("social_messages")
    .upsert(row, { onConflict, ignoreDuplicates: true })
    .select(MESSAGE_COLUMNS);
  if (error) throw new Error(error.message);
  return ((data ?? [])[0] as SocialMessageRow | undefined) ?? null;
}

/** A guarded update: only applies while the row is still in `fromStatus` (when given). */
export async function updateMessage(
  id: string,
  patch: Partial<Omit<SocialMessageRow, "id" | "conversation_id" | "platform" | "direction" | "created_at" | "updated_at">>,
  fromStatus?: SocialMessageStatus,
): Promise<SocialMessageRow | null> {
  let q = supabaseAdmin().from("social_messages").update(patch).eq("id", id);
  if (fromStatus) q = q.eq("status", fromStatus);
  const { data, error } = await q.select(MESSAGE_COLUMNS).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SocialMessageRow | null) ?? null;
}
