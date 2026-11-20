import { sendMetaText } from "@/lib/social-inbox/meta";
import { TIKTOK_INVALID_TOKEN, sendTikTokText, tiktokAccess } from "@/lib/social-inbox/tiktok";
import type { SocialConversationRow } from "@/lib/social-inbox/store";

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
    const again = await tiktokAccess({ force: true });
    if (!again.ok) return again;
    return sendTikTokText(again.businessId, again.token, conversation.external_id, text);
  }
  return sendMetaText(conversation.external_id, text, tag);
}
