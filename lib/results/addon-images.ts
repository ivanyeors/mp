/** Add-on card imagery: Item → primary Media Asset URL resolution. Pure — no I/O. */

export type AddonItemMediaRef = {
  id: number;
  primary_media_asset_id: string | null;
  /**
   * The Item's (category, name) family — sizes of one accessory. A size with no
   * image of its own shows its family's, so one photo covers XS–L.
   */
  family?: string;
};
export type AddonMediaAsset = { id: string; kind: string; hosted_url: string | null };

/**
 * item_id → hosted image URL from the Item's primary Media Asset (image kind
 * only), else from the lowest-id Item in its family that has one.
 */
export function resolveAddonImageUrls(
  items: AddonItemMediaRef[],
  assets: AddonMediaAsset[],
): Map<number, string> {
  const urlByAsset = new Map<string, string>();
  for (const a of assets) {
    if (a.kind === "image" && a.hosted_url) urlByAsset.set(a.id, a.hosted_url);
  }
  const out = new Map<number, string>();
  const familyUrl = new Map<string, string>();
  for (const it of [...items].sort((a, b) => a.id - b.id)) {
    const url = it.primary_media_asset_id
      ? urlByAsset.get(it.primary_media_asset_id)
      : undefined;
    if (!url) continue;
    out.set(it.id, url);
    if (it.family != null && !familyUrl.has(it.family)) familyUrl.set(it.family, url);
  }
  for (const it of items) {
    if (out.has(it.id) || it.family == null) continue;
    const url = familyUrl.get(it.family);
    if (url) out.set(it.id, url);
  }
  return out;
}
