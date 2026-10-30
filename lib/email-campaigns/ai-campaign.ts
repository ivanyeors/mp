/**
 * What an AI writing call needs to know of its campaign
 * (PRD-campaign-email-editor slices 09, 10 and 17), read on the server before
 * Claude is asked: that the email can still change, since a started
 * campaign's is fixed and nothing writes into it, Claude included; and
 * whether points are live (`pointsCheck`'s rule), so Claude may mention them.
 * It reads no customer. Server-only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { claimBonusOffer } from "@/lib/points/offer";
import { readPointsSettings } from "@/lib/points/server";
import { getCampaign } from "./store";

export async function campaignForAiWriting(
  admin: SupabaseClient,
  campaignId: string | null,
): Promise<{ ok: true; pointsLive: boolean } | { ok: false; status: number; error: string }> {
  if (campaignId) {
    const campaign = await getCampaign(admin, campaignId.toLowerCase());
    if (!campaign) return { ok: false, status: 404, error: "That campaign does not exist." };
    if (campaign.lockedAt) return { ok: false, status: 409, error: "Sending has started, so the email is fixed." };
  }
  const pointsLive = await readPointsSettings(admin)
    .then((s) => claimBonusOffer(s).live)
    .catch(() => false);
  return { ok: true, pointsLive };
}
