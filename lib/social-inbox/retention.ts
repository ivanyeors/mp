import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * How long customer messages are kept (the privacy policy, section 8, says
 * the same). Past it, a message is deleted, and so is a conversation nobody
 * has written in since, with the customer's name and username. TikTok's data
 * security review asks for exactly this: personal data kept no longer than
 * the purpose needs.
 *
 * The cards already posted in the Telegram group are not touched; the bot
 * cannot delete group messages older than 48 hours.
 */
export const SOCIAL_INBOX_RETENTION_DAYS = 365;

export function retentionCutoff(now: Date): string {
  return new Date(now.getTime() - SOCIAL_INBOX_RETENTION_DAYS * 86_400_000).toISOString();
}

/**
 * Daily, from the results-sla cron. A conversation counts as untouched when
 * its row hasn't changed since the cutoff: every message in or out updates
 * it, so `updated_at` is its last activity. Deleting it takes its messages
 * with it; older messages in a conversation that is still going are deleted
 * on their own.
 */
export async function purgeOldSocialMessages(now = new Date()): Promise<{ conversations: number; messages: number }> {
  const cutoff = retentionCutoff(now);
  const admin = supabaseAdmin();

  const { count: conversations, error: conversationError } = await admin
    .from("social_conversations")
    .delete({ count: "exact" })
    .lt("updated_at", cutoff);
  if (conversationError) throw new Error(conversationError.message);

  const { count: messages, error: messageError } = await admin
    .from("social_messages")
    .delete({ count: "exact" })
    .lt("created_at", cutoff);
  if (messageError) throw new Error(messageError.message);

  return { conversations: conversations ?? 0, messages: messages ?? 0 };
}
