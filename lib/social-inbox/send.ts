import { sendMetaText } from "@/lib/social-inbox/meta";
import { TIKTOK_INVALID_TOKEN, sendTikTokText, tiktokAccess } from "@/lib/social-inbox/tiktok";
import type { SocialConversationRow } from "@/lib/social-inbox/store";

/**
 * One text reply to a customer, on the platform they wrote from. The caller
 * has already checked the reply window (platforms.ts) and passes Meta's tag.
 */
export async function sendToCustomer(
  conversation: Pick<SocialConversationRow, "platform" | "external_id">,
  text: string,
  tag: "HUMAN_AGENT" | null,
): Promise<{ ok: true; messageId: string | null } | { ok: false; error: string }> {
  if (conversation.platform === "tiktok") {
    const access = await tiktokAccess();
    if (!access.ok) return access;
    const sent = await sendTikTokText(access.businessId, access.token, conversation.external_id, text);
    if (sent.ok || sent.code !== TIKTOK_INVALID_TOKEN) return sent;
    // The token was replaced or revoked before its expiry: refresh once and retry.
    const again = await tiktokAccess({ force: true });
    if (!again.ok) return again;
    return sendTikTokText(again.businessId, again.token, conversation.external_id, text);
  }
  return sendMetaText(conversation.external_id, text, tag);
}
