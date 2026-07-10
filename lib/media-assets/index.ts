import { supabaseAdmin } from "@/lib/supabase/server";
import {
  type CreateMediaAssetInput,
  type MediaAsset,
  type UpdateMediaAssetInput,
  planBucketBackfill,
  validateCreateMediaAsset,
  validateUpdateMediaAsset,
} from "./types";

export type {
  CreateMediaAssetInput,
  MediaAsset,
  MediaAssetKind,
  UpdateMediaAssetInput,
} from "./types";
export {
  MEDIA_ASSET_KINDS,
  displayNameFromStoragePath,
  isMediaAssetKind,
  planBucketBackfill,
  validateCreateMediaAsset,
  validateUpdateMediaAsset,
} from "./types";
export {
  DriveError,
  downloadFile,
  driveErrorStatus,
  listFolder,
  listSharedDrives,
  parseDriveFileId,
  resolveUrl,
} from "./drive";
export type { DriveFileMeta, DriveFolderListing, DriveSharedDrive } from "./drive";
export { ImportDriveError, importFromDrive } from "./import-drive";
export type { ImportDriveResult } from "./import-drive";

function admin() {
  return supabaseAdmin();
}

export async function listMediaAssets(opts?: {
  search?: string;
  kind?: string;
  limit?: number;
}): Promise<MediaAsset[]> {
  let q = admin()
    .from("media_assets")
    .select("*")
    .order("created_at", { ascending: false });

  if (opts?.kind) q = q.eq("kind", opts.kind);
  if (opts?.search?.trim()) q = q.ilike("name", `%${opts.search.trim()}%`);
  if (opts?.limit) q = q.limit(opts.limit);

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

  const { data, error } = await admin()
    .from("media_assets")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as MediaAsset;
}

export async function deleteMediaAsset(id: string): Promise<void> {
  const { error } = await admin().from("media_assets").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Register existing `media` bucket objects as image Assets. Idempotent on hosted_url. */
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
