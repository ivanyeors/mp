import { replyInGroup, sendGroupMessage, sendGroupPhoto } from "@/lib/telegram/bot-api";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  TELEGRAM_MAX_CAPTION,
  UNSENT_NOTE,
  renderEchoNote,
  renderInboxCard,
} from "@/lib/social-inbox/cards";
import { fetchMetaProfile } from "@/lib/social-inbox/meta";
import {
  MESSAGE_COLUMNS,
  ensureConversation,
  getConversation,
  getMessageByExternalId,
  insertMessage,
  updateConversation,
  updateMessage,
  type SocialConversationRow,
  type SocialMessageRow,
} from "@/lib/social-inbox/store";
import type { SocialEvent } from "@/lib/social-inbox/types";

const ECHO_MATCH_MS = 2 * 60_000;
const PROFILE_TTL_MS = 30 * 24 * 3_600_000;
const STALE_CLAIM_MS = 5 * 60_000;

export type IngestSummary = {
  carded: number;
  duplicates: number;
  echoes: number;
  unsent: number;
  failed: number;
};

const time = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : Number.NaN);

export async function ingestSocialEvents(events: SocialEvent[], now = new Date()): Promise<IngestSummary> {
  const summary: IngestSummary = { carded: 0, duplicates: 0, echoes: 0, unsent: 0, failed: 0 };
  for (const event of events) {
    try {
      if (event.kind === "message") {
        const outcome = await ingestMessage(event, now);
        if (outcome === "duplicate") summary.duplicates += 1;
        else if (outcome === "carded") summary.carded += 1;
        else summary.failed += 1;
      } else if (event.kind === "echo") {
        if (await ingestEcho(event, now)) summary.echoes += 1;
      } else if (await ingestUnsend(event, now)) {
        summary.unsent += 1;
      }
    } catch (error) {
      summary.failed += 1;
      console.error("[social-inbox] ingest failed", event.platform, event.kind, error);
    }
  }
  return summary;
}

async function ingestMessage(
  event: Extract<SocialEvent, { kind: "message" }>,
  now: Date,
): Promise<"carded" | "duplicate" | "failed"> {
  const conversation = await ensureConversation(event.platform, event.externalId);
  const row = await insertMessage({
    conversation_id: conversation.id,
    platform: event.platform,
    direction: "inbound",
    source: "customer",
    external_message_id: event.messageId,
    body: event.text,
    attachments: event.attachments,
    sent_at: event.sentAt,
    status: "new",
    sent_by_telegram_user_id: null,
    sent_by_name: null,
    telegram_source_message_id: null,
  });
  if (!row) return "duplicate";

  const patch: Partial<SocialConversationRow> = {};
  if (!(time(conversation.last_inbound_at) >= time(event.sentAt))) patch.last_inbound_at = event.sentAt;
  if (event.username && event.username !== conversation.username) patch.username = event.username;
  if (
    (event.platform === "facebook" || event.platform === "instagram") &&
    !(now.getTime() - time(conversation.profile_checked_at) < PROFILE_TTL_MS)
  ) {
    const profile = await fetchMetaProfile(event.platform, event.externalId);
    patch.profile_checked_at = now.toISOString();
    if (profile?.displayName) patch.display_name = profile.displayName;
    if (profile?.username) patch.username = profile.username;
  }
  if (Object.keys(patch).length) await updateConversation(conversation.id, patch);

  return (await cardMessage(row, { ...conversation, ...patch })) ? "carded" : "failed";
}

export async function cardMessage(row: SocialMessageRow, conversation: SocialConversationRow): Promise<boolean> {
  const claimed = await updateMessage(row.id, { status: "carding" }, "new");
  if (!claimed) return false;

  const input = {
    platform: row.platform,
    customer: { displayName: conversation.display_name, username: conversation.username },
    text: row.body,
    attachments: row.attachments ?? [],
    sentAt: row.sent_at,
  };
  const replyToMessageId = conversation.last_card_message_id;
  const photoIndex = input.attachments.findIndex((a) => a.kind === "image" && !!a.url);

  let sent: Awaited<ReturnType<typeof sendGroupMessage>> | null = null;
  if (photoIndex >= 0) {
    const caption = renderInboxCard({ ...input, photoIndex }, TELEGRAM_MAX_CAPTION);
    sent = await sendGroupPhoto(input.attachments[photoIndex].url as string, caption, { replyToMessageId });
    if (!sent.ok) console.warn("[social-inbox] photo card failed, sending text", sent.error);
  }
  if (!sent?.ok) sent = await sendGroupMessage(renderInboxCard(input), undefined, { replyToMessageId });

  if (!sent.ok) {
    await updateMessage(row.id, { status: "new", error: sent.error }, "carding");
    console.error("[social-inbox] card failed", sent.error);
    return false;
  }
  await updateMessage(
    row.id,
    { status: "carded", error: null, telegram_chat_id: sent.chatId, telegram_message_id: sent.messageId },
    "carding",
  );
  await updateConversation(conversation.id, { last_card_chat_id: sent.chatId, last_card_message_id: sent.messageId });
  return true;
}

async function ingestEcho(event: Extract<SocialEvent, { kind: "echo" }>, now: Date): Promise<boolean> {
  if (await getMessageByExternalId(event.platform, event.messageId)) return false;
  const conversation = await ensureConversation(event.platform, event.externalId);

  const { data: pending } = await supabaseAdmin()
    .from("social_messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", conversation.id)
    .eq("source", "telegram")
    .is("external_message_id", null)
    .in("status", ["sending", "sent"])
    .order("created_at", { ascending: false })
    .limit(10);
  const ours = ((pending ?? []) as SocialMessageRow[]).find(
    (r) => (r.body ?? "").trim() === (event.text ?? "").trim() && now.getTime() - time(r.created_at) < ECHO_MATCH_MS,
  );
  if (ours) {
    await supabaseAdmin()
      .from("social_messages")
      .update({ external_message_id: event.messageId })
      .eq("id", ours.id)
      .is("external_message_id", null);
    return false;
  }

  const row = await insertMessage({
    conversation_id: conversation.id,
    platform: event.platform,
    direction: "outbound",
    source: "platform_app",
    external_message_id: event.messageId,
    body: event.text,
    attachments: event.attachments,
    sent_at: event.sentAt,
    status: "recorded",
    sent_by_telegram_user_id: null,
    sent_by_name: null,
    telegram_source_message_id: null,
  });
  if (!row) return false;
  if (!(time(conversation.last_outbound_at) >= time(event.sentAt))) {
    await updateConversation(conversation.id, { last_outbound_at: event.sentAt });
  }
  if (conversation.last_card_message_id) {
    const noteId = await replyInGroup(
      renderEchoNote(event.platform, event.text, event.attachments),
      conversation.last_card_message_id,
    );
    if (noteId) {
      await updateMessage(row.id, { telegram_chat_id: conversation.last_card_chat_id, telegram_message_id: noteId });
    }
  }
  return true;
}

async function ingestUnsend(event: Extract<SocialEvent, { kind: "unsend" }>, now: Date): Promise<boolean> {
  const row = await getMessageByExternalId(event.platform, event.messageId);
  if (!row || row.unsent_at) return false;
  await updateMessage(row.id, { unsent_at: now.toISOString() });
  if (row.telegram_message_id) await replyInGroup(UNSENT_NOTE, row.telegram_message_id);
  return true;
}

export async function sweepUncarded(opts: { max?: number; now?: Date } = {}): Promise<{ retried: number; carded: number }> {
  const now = opts.now ?? new Date();
  const admin = supabaseAdmin();

  await admin
    .from("social_messages")
    .update({ status: "new" })
    .eq("status", "carding")
    .lt("updated_at", new Date(now.getTime() - STALE_CLAIM_MS).toISOString());

  const { data, error } = await admin
    .from("social_messages")
    .select(MESSAGE_COLUMNS)
    .eq("direction", "inbound")
    .eq("status", "new")
    .lt("created_at", new Date(now.getTime() - 60_000).toISOString())
    .order("created_at", { ascending: true })
    .limit(opts.max ?? 10);
  if (error) throw new Error(error.message);

  let carded = 0;
  const rows = (data ?? []) as SocialMessageRow[];
  for (const row of rows) {
    const conversation = await getConversation(row.conversation_id);
    if (conversation && (await cardMessage(row, conversation))) carded += 1;
  }
  return { retried: rows.length, carded };
}
