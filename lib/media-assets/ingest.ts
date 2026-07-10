import { supabaseAdmin } from "@/lib/supabase/server";
import { createMediaAsset, type MediaAsset } from "@/lib/media-assets";
import { optimizeImageForWeb, optimizedStorageName } from "@/lib/media-assets/optimize";

export type IngestImageResult = {
  asset: MediaAsset;
  storagePath: string;
};

/** Optimize → upload to `media` bucket → create image Media Asset. */
export async function ingestImageAsset(opts: {
  bytes: Buffer;
  originalName?: string;
  altText?: string | null;
  createdBy?: string | null;
  drive_file_id?: string | null;
  drive_url?: string | null;
  imported_at?: string | null;
}): Promise<IngestImageResult> {
  const optimized = await optimizeImageForWeb(opts.bytes);
  const storagePath = optimizedStorageName(opts.originalName);
  const admin = supabaseAdmin();

  const { error: uploadError } = await admin.storage
    .from("media")
    .upload(storagePath, optimized.buffer, {
      contentType: optimized.mimeType,
      cacheControl: "31536000",
      upsert: false,
    });
  if (uploadError) throw new Error(uploadError.message);

  const { data: pub } = admin.storage.from("media").getPublicUrl(storagePath);
  const asset = await createMediaAsset({
    kind: "image",
    name: opts.originalName?.trim() || storagePath,
    alt_text: opts.altText ?? null,
    hosted_url: pub.publicUrl,
    drive_file_id: opts.drive_file_id ?? null,
    drive_url: opts.drive_url ?? null,
    mime_type: optimized.mimeType,
    byte_size: optimized.byteSize,
    width: optimized.width,
    height: optimized.height,
    imported_at: opts.imported_at ?? null,
    created_by: opts.createdBy ?? null,
  });

  return { asset, storagePath };
}

/**
 * Optimize + upload a small preview image (e.g. Drive video/PDF thumb).
 * Does not create a Media Asset — caller stores the URL on an existing record.
 */
export async function hostPreviewImage(opts: {
  bytes: Buffer;
  originalName?: string;
}): Promise<{ publicUrl: string; storagePath: string }> {
  // ponytail: 800px cap for thumbs; bump if library grid goes retina-heavy
  const optimized = await optimizeImageForWeb(opts.bytes, { longEdgeCap: 800 });
  const storagePath = optimizedStorageName(
    opts.originalName ? `${opts.originalName}-preview` : "preview",
  );
  const admin = supabaseAdmin();

  const { error: uploadError } = await admin.storage
    .from("media")
    .upload(storagePath, optimized.buffer, {
      contentType: optimized.mimeType,
      cacheControl: "31536000",
      upsert: false,
    });
  if (uploadError) throw new Error(uploadError.message);

  const { data: pub } = admin.storage.from("media").getPublicUrl(storagePath);
  return { publicUrl: pub.publicUrl, storagePath };
}
