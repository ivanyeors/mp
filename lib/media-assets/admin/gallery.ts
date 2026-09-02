import {
  listMediaAssets,
  listMediaFolders,
  type MediaAsset,
  type MediaFolder,
} from "@/lib/media-assets";

export interface MediaGallerySeed {
  /** Exactly the JSON `/api/media-assets` returns. */
  assets: { ok: true; assets: MediaAsset[] };
  /** Exactly the JSON `/api/media-folders` returns. */
  folders: { ok: true; folders: MediaFolder[] };
}

/**
 * The two unfiltered listings the media gallery fetches on mount, loaded
 * concurrently for the server render.
 *
 * Returns null when the registry is empty: the client's own loader then runs
 * and performs its one-shot backfill from the storage bucket, which a server
 * render must not do. Landing-image overrides and usage counts stay on the
 * client.
 */
export async function loadMediaGallerySeed(): Promise<MediaGallerySeed | null> {
  const [assets, folders] = await Promise.all([listMediaAssets(), listMediaFolders()]);

  if (assets.length === 0) return null;

  return {
    assets: { ok: true, assets },
    folders: { ok: true, folders },
  };
}
