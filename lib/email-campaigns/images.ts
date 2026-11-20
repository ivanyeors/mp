import type { SupabaseClient } from "@supabase/supabase-js";
import type { CampaignBlockImages } from "@/lib/email/campaign-blocks";
import { imageAssetsIn, type CampaignContent } from "./content";

export interface CampaignImageFailure {
  assetId: string;
  reason: string;
}

export interface CampaignImages {
  images: CampaignBlockImages;
  failed: CampaignImageFailure[];
}

const NONE: CampaignImages = { images: {}, failed: [] };

export async function readCampaignImages(
  admin: SupabaseClient,
  content: CampaignContent | null,
  also: readonly string[] = [],
): Promise<CampaignImages> {
  const assets = [...new Set([...(content ? imageAssetsIn(content) : []), ...also])];
  if (!assets.length) return NONE;
  const { ensureEmailRenditions } = await import("@/lib/media-assets/email-renditions");
  try {
    const { renditions, failed } = await ensureEmailRenditions(admin, assets);
    const images: Record<string, CampaignBlockImages[string]> = {};
    for (const [id, r] of renditions) images[id] = { url: r.url, width: r.width, height: r.height, hasAlpha: r.hasAlpha };
    return { images, failed: [...failed].map(([assetId, reason]) => ({ assetId, reason })) };
  } catch (err) {
    const reason = `The email's images couldn't be read: ${err instanceof Error ? err.message : String(err)}`;
    return { images: {}, failed: assets.map((assetId) => ({ assetId, reason })) };
  }
}

export function campaignImagesProblem({ failed }: CampaignImages): string | null {
  if (!failed.length) return null;
  const more = failed.length > 1 ? ` (and ${failed.length - 1} more)` : "";
  return `an image in the email has no copy an inbox can show${more}: ${failed[0].reason}`;
}

export function campaignImageFieldErrors(content: CampaignContent | null, { failed }: CampaignImages): Record<string, string> {
  const out: Record<string, string> = {};
  if (!content) return out;
  const reasons = new Map(failed.map((f) => [f.assetId, f.reason]));
  content.blocks.forEach((b, i) => {
    const reason = "image" in b ? reasons.get(b.image.asset) : undefined;
    if (reason) out[`content.blocks.${i}.image.asset`] = reason;
  });
  return out;
}
