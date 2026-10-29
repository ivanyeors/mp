/**
 * A campaign's images as the email shows them (PRD-campaign-email-editor
 * slice 05): each placed Media Asset's email rendition, a JPEG or PNG at most
 * 1,200px wide, since classic Outlook shows no WebP master.
 *
 * Read before the email is rendered, by the preview, the test send and every
 * batch of a wave, so all three show the same picture. A rendition is made
 * the first time an asset is placed and reused from then on, by every
 * campaign and every send (lib/media-assets/email-renditions.ts).
 *
 * Server only: it reads the database and, for an asset placed for the first
 * time, makes its rendition with sharp.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CampaignBlockImages } from "@/lib/email/campaign-blocks";
import { imageAssetsIn, type CampaignContent } from "./content";

/** An image whose email rendition could not be read or made, and why, in words for Staff. */
export interface CampaignImageFailure {
  assetId: string;
  reason: string;
}

export interface CampaignImages {
  images: CampaignBlockImages;
  failed: CampaignImageFailure[];
}

const NONE: CampaignImages = { images: {}, failed: [] };

/**
 * Each image the blocks place, and each of `also` (the products' photos,
 * slice 07), as its email rendition, made now if it has none yet. Never
 * throws: an image that cannot be read or made is in `failed`, and the
 * caller says so. Content with no image reads nothing.
 */
export async function readCampaignImages(
  admin: SupabaseClient,
  content: CampaignContent | null,
  also: readonly string[] = [],
): Promise<CampaignImages> {
  const assets = [...new Set([...(content ? imageAssetsIn(content) : []), ...also])];
  if (!assets.length) return NONE;
  // Only an email with images loads sharp.
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

/** Pure — what stops a send for want of an image, or null: the first image that failed, and why. */
export function campaignImagesProblem({ failed }: CampaignImages): string | null {
  if (!failed.length) return null;
  const more = failed.length > 1 ? ` (and ${failed.length - 1} more)` : "";
  return `an image in the email has no copy an inbox can show${more}: ${failed[0].reason}`;
}

/**
 * Pure — each failed image as a field error on every block that places it,
 * keyed as Save's errors are (`content.blocks.<i>.image.asset`).
 */
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
