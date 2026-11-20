import { supabaseAdmin } from "@/lib/supabase/server";
import {
  listAssetUsages,
  usageBlocksDeletion,
  type ImageUsageEntry,
} from "@/lib/media/image-usages";
import { storagePathFromHostedUrl } from "@/lib/media-assets/ingest";
import {
  type CreateMediaAssetInput,
  type CreateMediaFolderInput,
  type MediaAsset,
  type MediaFolder,
  type UpdateMediaAssetInput,
  type UpdateMediaFolderInput,
  normalizeTags,
  planBucketBackfill,
  validateCreateMediaAsset,
  validateCreateMediaFolder,
  validateUpdateMediaAsset,
  validateUpdateMediaFolder,
} from "./types";

export type {
  CreateMediaAssetInput,
  CreateMediaFolderInput,
  MediaAsset,
  MediaAssetKind,
  MediaFolder,
  UpdateMediaAssetInput,
  UpdateMediaFolderInput,
} from "./types";
export {
  MEDIA_ASSET_KINDS,
  displayNameFromStoragePath,
  isMediaAssetKind,
  matchesFolderFilter,
  matchesKindFilter,
  matchesTagFilter,
  normalizeTags,
  planBucketBackfill,
  validateCreateMediaAsset,
  validateCreateMediaFolder,
  validateUpdateMediaAsset,
  validateUpdateMediaFolder,
} from "./types";
export {
  DriveError,
  downloadFile,
  downloadThumbnail,
  driveErrorStatus,
  listFolder,
  listSharedDrives,
  parseDriveFileId,
  resolveUrl,
} from "./drive";
export type { DriveFileMeta, DriveFolderListing, DriveSharedDrive } from "./drive";
export {
  ImportDriveError,
  importFromDrive,
  reimportImageFromDrive,
} from "./import-drive";
export type { ImportDriveResult } from "./import-drive";

export class MediaAssetInUseError extends Error {
  constructor(
    public readonly usages: ImageUsageEntry[],
    public readonly deletable = true,
  ) {
    super("Asset is in use");
    this.name = "MediaAssetInUseError";
  }
}

function admin() {
  return supabaseAdmin();
}

const DEFAULT_MEDIA_ASSET_LIST_LIMIT = 5000;

export async function listMediaAssets(opts?: {
  search?: string;
  kind?: string;
  folder_id?: string;
  unfiled?: boolean;
  tag?: string;
  limit?: number;
}): Promise<MediaAsset[]> {
  let q = admin()
    .from("media_assets")
    .select("*")
    .order("created_at", { ascending: false });

  if (opts?.kind) q = q.eq("kind", opts.kind);
  if (opts?.search?.trim()) q = q.ilike("name", `%${opts.search.trim()}%`);
  if (opts?.unfiled) q = q.is("folder_id", null);
  else if (opts?.folder_id) q = q.eq("folder_id", opts.folder_id);
  if (opts?.tag?.trim()) q = q.contains("tags", [opts.tag.trim().toLowerCase()]);
  q = q.limit(opts?.limit && opts.limit > 0 ? opts.limit : DEFAULT_MEDIA_ASSET_LIST_LIMIT);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as MediaAsset[];
}

export async function getMediaAsset(id: string): Promise<MediaAsset | null> {
  const { data, error } = await admin()
    .from("media_assets")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as MediaAsset | null;
}

export async function getMediaAssetByDriveFileId(
  driveFileId: string,
): Promise<MediaAsset | null> {
  const id = driveFileId.trim();
  if (!id) return null;
  const { data, error } = await admin()
    .from("media_assets")
    .select("*")
    .eq("drive_file_id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as MediaAsset | null;
}

export async function createMediaAsset(input: CreateMediaAssetInput): Promise<MediaAsset> {
  const err = validateCreateMediaAsset(input);
  if (err) throw new Error(err);

  const row = {
    kind: input.kind,
    name: input.name.trim(),
    alt_text: input.alt_text ?? null,
    hosted_url: input.hosted_url?.trim() || null,
    drive_file_id: input.drive_file_id?.trim() || null,
    drive_url: input.drive_url?.trim() || null,
    mime_type: input.mime_type ?? null,
    byte_size: input.byte_size ?? null,
    width: input.width ?? null,
    height: input.height ?? null,
    imported_at: input.imported_at ?? null,
    created_by: input.created_by ?? null,
  };

  const { data, error } = await admin().from("media_assets").insert(row).select("*").single();
  if (error) throw new Error(error.message);
  return data as MediaAsset;
}

export async function updateMediaAsset(
  id: string,
  input: UpdateMediaAssetInput,
): Promise<MediaAsset> {
  const err = validateUpdateMediaAsset(input);
  if (err) throw new Error(err);

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.alt_text !== undefined) patch.alt_text = input.alt_text;
  if (input.folder_id !== undefined) {
    patch.folder_id = input.folder_id === null ? null : input.folder_id.trim();
  }
  if (input.tags !== undefined) patch.tags = normalizeTags(input.tags) ?? [];

  const { data, error } = await admin()
    .from("media_assets")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as MediaAsset;
}

export async function listMediaFolders(): Promise<MediaFolder[]> {
  const { data, error } = await admin()
    .from("media_folders")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as MediaFolder[];
}

export async function createMediaFolder(input: CreateMediaFolderInput): Promise<MediaFolder> {
  const err = validateCreateMediaFolder(input);
  if (err) throw new Error(err);

  const { data, error } = await admin()
    .from("media_folders")
    .insert({ name: input.name.trim() })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as MediaFolder;
}

export async function updateMediaFolder(
  id: string,
  input: UpdateMediaFolderInput,
): Promise<MediaFolder> {
  const err = validateUpdateMediaFolder(input);
  if (err) throw new Error(err);

  const { data, error } = await admin()
    .from("media_folders")
    .update({ name: input.name.trim() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as MediaFolder;
}

export async function deleteMediaFolder(id: string): Promise<void> {
  const { error } = await admin().from("media_folders").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteMediaAsset(id: string): Promise<void> {
  const { error } = await admin().from("media_assets").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function patchMediaAssetHosted(
  id: string,
  patch: {
    hosted_url: string;
    mime_type: string;
    byte_size: number;
    width: number;
    height: number;
    imported_at: string;
  },
): Promise<MediaAsset> {
  const { data, error } = await admin()
    .from("media_assets")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as MediaAsset;
}

export async function deleteMediaAssetGuarded(
  id: string,
  opts?: { force?: boolean },
): Promise<void> {
  const asset = await getMediaAsset(id);
  if (!asset) throw new Error("Not found");

  const usages = await listAssetUsages({
    id: asset.id,
    hosted_url: asset.hosted_url,
  });
  if (usages.some(usageBlocksDeletion)) throw new MediaAssetInUseError(usages, false);
  if (!opts?.force && usages.length > 0) throw new MediaAssetInUseError(usages);

  const master = asset.hosted_url ? storagePathFromHostedUrl(asset.hosted_url) : null;

  await deleteMediaAsset(id);
  if (master) {
    await admin().storage.from("media").remove([master]);
  }
}

export async function touchLastUsed(opts: {
  urls?: string[];
  assetIds?: string[];
}): Promise<void> {
  const urls = (opts.urls ?? []).map((u) => u.trim()).filter(Boolean);
  const assetIds = (opts.assetIds ?? []).map((u) => u.trim()).filter(Boolean);
  if (urls.length === 0 && assetIds.length === 0) return;

  const now = new Date().toISOString();
  const db = admin();

  if (urls.length > 0) {
    const { error } = await db
      .from("media_assets")
      .update({ last_used_at: now })
      .in("hosted_url", urls);
    if (error) throw new Error(error.message);
  }
  if (assetIds.length > 0) {
    const { error } = await db
      .from("media_assets")
      .update({ last_used_at: now })
      .in("id", assetIds);
    if (error) throw new Error(error.message);
  }
}

export async function backfillMediaAssetsFromBucket(): Promise<{
  inserted: number;
  skipped: number;
}> {
  const db = admin();
  const { data: listed, error: listError } = await db.storage.from("media").list("", {
    sortBy: { column: "created_at", order: "desc" },
    limit: 1000,
  });
  if (listError) throw new Error(listError.message);

  const { data: existing, error: existingError } = await db
    .from("media_assets")
    .select("hosted_url")
    .not("hosted_url", "is", null);
  if (existingError) throw new Error(existingError.message);

  const files = (listed ?? [])
    .filter((f) => f.name !== ".emptyFolderPlaceholder")
    .map((f) => {
      const { data: pub } = db.storage.from("media").getPublicUrl(f.name);
      return {
        name: f.name,
        url: pub.publicUrl,
        created_at: f.created_at ?? undefined,
        metadata: f.metadata as { mimetype?: string; size?: number } | null,
      };
    });

  const { toInsert, skipped } = planBucketBackfill(
    (existing ?? []).map((r) => r.hosted_url as string),
    files,
  );

  if (toInsert.length === 0) return { inserted: 0, skipped };

  const { error: insertError } = await db.from("media_assets").insert(
    toInsert.map((row) => ({
      kind: row.kind,
      name: row.name,
      hosted_url: row.hosted_url,
      mime_type: row.mime_type ?? null,
      byte_size: row.byte_size ?? null,
    })),
  );
  if (insertError) throw new Error(insertError.message);

  return { inserted: toInsert.length, skipped };
}
