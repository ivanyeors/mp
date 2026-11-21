import { supabaseAdmin } from "@/lib/supabase/server";
import { optimizeImageForWeb, optimizedStorageName } from "@/lib/media-assets/optimize";
import { MAX_IMAGES_PER_SESSION, MAX_FILE_BYTES, type ConfigUpload } from "./limits";

const BUCKET = "media";

export { MAX_IMAGES_PER_SESSION, MAX_FILE_BYTES, type ConfigUpload };

export class UploadRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadRefusedError";
  }
}

export function assertUploadAllowed(
  existingCount: number,
  fileSize: number,
  mimeType: string,
): void {
  if (existingCount >= MAX_IMAGES_PER_SESSION) {
    throw new UploadRefusedError(`Up to ${MAX_IMAGES_PER_SESSION} images per session.`);
  }
  if (fileSize > MAX_FILE_BYTES) {
    throw new UploadRefusedError(
      `Each image must be ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB or smaller.`,
    );
  }
  if (!mimeType.startsWith("image/")) {
    throw new UploadRefusedError("Only image files are allowed.");
  }
}

export async function saveConfigUpload(opts: {
  sessionId: string;
  bytes: Buffer;
  originalName?: string;
}): Promise<ConfigUpload> {
  const optimized = await optimizeImageForWeb(opts.bytes);
  const storagePath = `config-uploads/${opts.sessionId}/${optimizedStorageName(opts.originalName)}`;
  const admin = supabaseAdmin();

  const { error: uploadError } = await admin.storage.from(BUCKET).upload(storagePath, optimized.buffer, {
    contentType: optimized.mimeType,
    cacheControl: "31536000",
    upsert: false,
  });
  if (uploadError) throw new Error(uploadError.message);

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(storagePath);

  const { data, error } = await admin
    .from("config_upload")
    .insert({
      session_id: opts.sessionId,
      storage_path: storagePath,
      hosted_url: pub.publicUrl,
      mime_type: optimized.mimeType,
      byte_size: optimized.byteSize,
      width: optimized.width,
      height: optimized.height,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data);
}

export async function listConfigUploads(sessionId: string): Promise<ConfigUpload[]> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("config_upload")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRow);
}

export async function deleteConfigUpload(id: string): Promise<void> {
  const admin = supabaseAdmin();
  const { data: row, error: readErr } = await admin
    .from("config_upload")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!row) return;

  await admin.storage.from(BUCKET).remove([row.storage_path as string]);
  const { error } = await admin.from("config_upload").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

type Row = {
  id: string;
  session_id: string;
  storage_path: string;
  hosted_url: string;
  mime_type: string;
  byte_size: number | string;
  width: number | null;
  height: number | null;
  created_at: string;
};

function mapRow(r: Row): ConfigUpload {
  return {
    id: r.id,
    sessionId: r.session_id,
    storagePath: r.storage_path,
    hostedUrl: r.hosted_url,
    mimeType: r.mime_type,
    byteSize: Number(r.byte_size),
    width: r.width ?? null,
    height: r.height ?? null,
    createdAt: r.created_at,
  };
}
