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
