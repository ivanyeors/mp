export type AddonItemMediaRef = {
  id: number;
  primary_media_asset_id: string | null;
  family?: string;
};
export type AddonMediaAsset = { id: string; kind: string; hosted_url: string | null };

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
