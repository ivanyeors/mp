import { supabaseAdmin } from "@/lib/supabase/server";
import { optimizeImageForWeb, optimizedStorageName } from "@/lib/media-assets/optimize";
import {
  PAYOUT_IMAGE_MAX_BYTES,
  PAYOUT_IMAGE_ALLOWED_MIME,
  checkPayoutImage,
} from "./limits";

const BUCKET = "partner-private";

export const SIGNED_URL_TTL_SECONDS = 900;

export const EMAIL_PROOF_TTL_SECONDS = 7 * 24 * 60 * 60;

export { PAYOUT_IMAGE_MAX_BYTES, PAYOUT_IMAGE_ALLOWED_MIME, checkPayoutImage };

export class PayoutUploadRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayoutUploadRefusedError";
  }
}

export function assertPayoutImageAllowed(fileSize: number, mimeType: string): void {
  const err = checkPayoutImage({ size: fileSize, type: mimeType });
  if (err) throw new PayoutUploadRefusedError(err);
}

export async function savePrivateImage(
  prefix: string,
  bytes: Buffer,
  originalName?: string,
): Promise<string> {
  const optimized = await optimizeImageForWeb(bytes);
  const path = `${prefix}/${optimizedStorageName(originalName)}`;
  const admin = supabaseAdmin();
  const { error } = await admin.storage.from(BUCKET).upload(path, optimized.buffer, {
    contentType: optimized.mimeType,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return path;
}

export async function signedImageUrl(
  path: string | null | undefined,
  expiresIn: number = SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  if (!path) return null;
  const admin = supabaseAdmin();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  if (error || !data) return null;
  return data.signedUrl;
}
