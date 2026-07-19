/** Add-on card imagery: Item → primary Media Asset URL resolution. Pure — no I/O. */

export type AddonItemMediaRef = { id: number; primary_media_asset_id: string | null };
export type AddonMediaAsset = { id: string; kind: string; hosted_url: string | null };

/** item_id → hosted image URL from the Item's primary Media Asset (image kind only). */
export function resolveAddonImageUrls(
  items: AddonItemMediaRef[],
  assets: AddonMediaAsset[],
): Map<number, string> {
  const urlByAsset = new Map<string, string>();
  for (const a of assets) {
    if (a.kind === "image" && a.hosted_url) urlByAsset.set(a.id, a.hosted_url);
  }
  const out = new Map<number, string>();
  for (const it of items) {
    const url = it.primary_media_asset_id
      ? urlByAsset.get(it.primary_media_asset_id)
      : undefined;
    if (url) out.set(it.id, url);
  }
  return out;
}
