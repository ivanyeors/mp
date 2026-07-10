import type { CreateMediaAssetInput, MediaAsset } from "@/lib/media-assets/types";
import {
  downloadFile,
  resolveUrl,
  type DriveFileMeta,
} from "@/lib/media-assets/drive";
import { ingestImageAsset, type IngestImageResult } from "@/lib/media-assets/ingest";

export type DriveFileMetaLike = Pick<
  DriveFileMeta,
  "id" | "name" | "mimeType" | "thumbnailLink" | "size" | "webViewLink" | "isFolder"
>;

export type ImportDriveErrorCode = "unsupported_kind" | "invalid_input";

export class ImportDriveError extends Error {
  constructor(
    public readonly code: ImportDriveErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ImportDriveError";
  }
}

export type ImportDriveResult = {
  asset: MediaAsset;
  existing: boolean;
};

export type ImportDriveDeps = {
  resolveUrl: (pasteUrl: string) => Promise<DriveFileMetaLike>;
  downloadFile: (fileId: string) => Promise<Buffer>;
  ingestImageAsset: (opts: {
    bytes: Buffer;
    originalName?: string;
    altText?: string | null;
    createdBy?: string | null;
    drive_file_id?: string | null;
    drive_url?: string | null;
    imported_at?: string | null;
  }) => Promise<IngestImageResult>;
  createMediaAsset: (input: CreateMediaAssetInput) => Promise<MediaAsset>;
  getMediaAssetByDriveFileId: (driveFileId: string) => Promise<MediaAsset | null>;
};

async function defaultDeps(): Promise<ImportDriveDeps> {
  // Dynamic import avoids circular load with the media-assets barrel.
  const registry = await import("@/lib/media-assets");
  return {
    resolveUrl,
    downloadFile,
    ingestImageAsset,
    createMediaAsset: registry.createMediaAsset,
    getMediaAssetByDriveFileId: registry.getMediaAssetByDriveFileId,
  };
}

function kindFromMime(mimeType: string): "image" | "video" | "pdf" | null {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf") return "pdf";
  return null;
}

/** Import a Drive file as a Media Asset (image hosted; video/PDF link-only). */
export async function importFromDrive(
  opts: { url?: string; fileId?: string; name?: string; createdBy?: string | null },
  deps?: ImportDriveDeps,
): Promise<ImportDriveResult> {
  const d = deps ?? (await defaultDeps());
  const paste = opts.url?.trim() || opts.fileId?.trim();
  if (!paste) throw new ImportDriveError("invalid_input", "url or fileId is required");

  const file = await d.resolveUrl(paste);
  if (file.isFolder) {
    throw new ImportDriveError("unsupported_kind", "Folders cannot be imported");
  }

  const existing = await d.getMediaAssetByDriveFileId(file.id);
  if (existing) return { asset: existing, existing: true };

  const kind = kindFromMime(file.mimeType);
  if (!kind) {
    throw new ImportDriveError(
      "unsupported_kind",
      `Unsupported Drive MIME type: ${file.mimeType}`,
    );
  }

  const name = opts.name?.trim() || file.name || file.id;
  const driveUrl = file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`;
  const importedAt = new Date().toISOString();

  if (kind === "image") {
    const bytes = await d.downloadFile(file.id);
    const { asset } = await d.ingestImageAsset({
      bytes,
      originalName: name,
      createdBy: opts.createdBy ?? null,
      drive_file_id: file.id,
      drive_url: driveUrl,
      imported_at: importedAt,
    });
    return { asset, existing: false };
  }

  const asset = await d.createMediaAsset({
    kind,
    name,
    drive_file_id: file.id,
    drive_url: driveUrl,
    mime_type: file.mimeType,
    byte_size: file.size,
    imported_at: importedAt,
    created_by: opts.createdBy ?? null,
  });
  return { asset, existing: false };
}
