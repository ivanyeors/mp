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
    mime_type: optimized.mimeType,
    byte_size: optimized.byteSize,
    width: optimized.width,
    height: optimized.height,
    created_by: opts.createdBy ?? null,
  });

  return { asset, storagePath };
}
