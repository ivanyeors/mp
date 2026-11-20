"use server";

import { assertAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { AI_DRAFT_KEPT_ACTION } from "@/lib/email-campaigns/ai-draft-shape";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
