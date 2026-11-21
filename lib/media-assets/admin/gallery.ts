import {
  listMediaAssets,
  listMediaFolders,
  type MediaAsset,
  type MediaFolder,
} from "@/lib/media-assets";

export interface MediaGallerySeed {
  assets: { ok: true; assets: MediaAsset[] };
  folders: { ok: true; folders: MediaFolder[] };
}

export async function loadMediaGallerySeed(): Promise<MediaGallerySeed | null> {
  const [assets, folders] = await Promise.all([listMediaAssets(), listMediaFolders()]);

  if (assets.length === 0) return null;

  return {
    assets: { ok: true, assets },
    folders: { ok: true, folders },
  };
}
