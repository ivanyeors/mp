import { sendMetaText } from "@/lib/social-inbox/meta";
import { sendTikTokText, tiktokAccess } from "@/lib/social-inbox/tiktok";
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
    return sendTikTokText(access.businessId, access.token, conversation.external_id, text);
  }
  return sendMetaText(conversation.external_id, text, tag);
}
