"use server";

import { assertAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { AI_DRAFT_KEPT_ACTION } from "@/lib/email-campaigns/ai-draft-shape";

/**
 * The campaign editor's AI writing actions (PRD-campaign-email-editor slice
 * 09). ✨ Generate itself streams from /api/campaigns/ai-draft; this records
 * what Staff did with a draft. Like every campaign action, `campaigns` first.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** *Keep*: the draft `draftId` was kept, for the audit log beside its call's entry. Writes nothing else. */
export async function keepAiDraft(draftId: string, campaignId: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await assertAdmin("campaigns");
  if (typeof draftId !== "string" || !UUID.test(draftId) || (campaignId !== null && (typeof campaignId !== "string" || !UUID.test(campaignId)))) {
    return { ok: false, error: "That draft does not exist." };
  }
  await recordAdminAction({
    actor: ctx,
    action: AI_DRAFT_KEPT_ACTION,
    entityType: "email_campaign",
    entityId: campaignId,
    after: { draft_id: draftId, kept: true },
  });
  return { ok: true };
}
