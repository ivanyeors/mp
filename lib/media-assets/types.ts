/** Media Asset registry — first-class DAM records (not raw bucket listings). */

export const MEDIA_ASSET_KINDS = ["image", "video", "pdf", "link"] as const;
export type MediaAssetKind = (typeof MEDIA_ASSET_KINDS)[number];

export type MediaAsset = {
  id: string;
  kind: MediaAssetKind;
  name: string;
  alt_text: string | null;
  hosted_url: string | null;
  drive_file_id: string | null;
  drive_url: string | null;
  mime_type: string | null;
  byte_size: number | null;
  width: number | null;
  height: number | null;
  imported_at: string | null;
  last_used_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateMediaAssetInput = {
  kind: MediaAssetKind;
  name: string;
  alt_text?: string | null;
  hosted_url?: string | null;
  drive_file_id?: string | null;
  drive_url?: string | null;
  mime_type?: string | null;
  byte_size?: number | null;
  width?: number | null;
  height?: number | null;
  imported_at?: string | null;
  created_by?: string | null;
};

export type UpdateMediaAssetInput = {
  name?: string;
  alt_text?: string | null;
};

export function isMediaAssetKind(value: unknown): value is MediaAssetKind {
  return typeof value === "string" && (MEDIA_ASSET_KINDS as readonly string[]).includes(value);
}

/** Validate create payload; returns error message or null. */
export function validateCreateMediaAsset(input: CreateMediaAssetInput): string | null {
  if (!isMediaAssetKind(input.kind)) return "Invalid kind";
  const name = input.name?.trim();
  if (!name) return "Name is required";
  if (input.kind === "image" && !input.hosted_url?.trim()) {
    return "Image assets require hosted_url";
  }
  if ((input.kind === "video" || input.kind === "pdf") && !input.drive_url?.trim() && !input.drive_file_id?.trim()) {
    return "Video/PDF assets require Drive provenance";
  }
  return null;
}

/** Validate update payload; returns error message or null. */
export function validateUpdateMediaAsset(input: UpdateMediaAssetInput): string | null {
  if (input.name !== undefined && !input.name.trim()) return "Name cannot be empty";
  if (input.name === undefined && input.alt_text === undefined) return "No fields to update";
  return null;
}

/** Display name from a storage object path (strip random prefix when present). */
export function displayNameFromStoragePath(path: string): string {
  const base = path.split("/").pop() ?? path;
  // e.g. abc123def_1710000000.webp → keep full name for uniqueness in UI
  return base;
}

/**
 * Idempotent backfill plan: skip hosted_urls already registered.
 * Pure — no I/O. Callers insert only `toInsert`.
 */
export function planBucketBackfill(
  existingHostedUrls: Iterable<string>,
  bucketFiles: Array<{ name: string; url: string; created_at?: string; metadata?: { mimetype?: string; size?: number } | null }>,
): { toInsert: CreateMediaAssetInput[]; skipped: number } {
  const known = new Set(
    [...existingHostedUrls].filter((u) => typeof u === "string" && u.length > 0),
  );
  const toInsert: CreateMediaAssetInput[] = [];
  let skipped = 0;

  for (const file of bucketFiles) {
    if (!file.name || file.name === ".emptyFolderPlaceholder") {
      skipped++;
      continue;
    }
    if (!file.url || known.has(file.url)) {
      skipped++;
      continue;
    }
    known.add(file.url);
    toInsert.push({
      kind: "image",
      name: displayNameFromStoragePath(file.name),
      hosted_url: file.url,
      mime_type: file.metadata?.mimetype ?? null,
      byte_size: file.metadata?.size ?? null,
    });
  }

  return { toInsert, skipped };
}
