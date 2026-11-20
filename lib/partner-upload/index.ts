import { supabaseAdmin } from "@/lib/supabase/server";
import { optimizeImageForWeb, optimizedStorageName } from "@/lib/media-assets/optimize";
import {
  LOGO_MAX_BYTES,
  LOGO_MIN_DIMENSION,
  LOGO_ALLOWED_MIME,
  LOGO_GUIDELINES,
} from "./limits";
import { applicantLogoFolder, partnerLogoFolder } from "./urls";

const BUCKET = "media";

export { LOGO_MAX_BYTES, LOGO_MIN_DIMENSION, LOGO_ALLOWED_MIME, LOGO_GUIDELINES };

export class LogoRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LogoRefusedError";
  }
}

export function assertLogoAllowed(fileSize: number, mimeType: string): void {
  if (!(LOGO_ALLOWED_MIME as readonly string[]).includes(mimeType)) {
    throw new LogoRefusedError("Logo must be a PNG, JPG, or WebP image.");
  }
  if (fileSize > LOGO_MAX_BYTES) {
    throw new LogoRefusedError(
      `Logo must be ${Math.round(LOGO_MAX_BYTES / (1024 * 1024))} MB or smaller.`,
    );
  }
}

async function saveLogoIn(
  folder: string,
  bytes: Buffer,
  originalName?: string,
): Promise<{ url: string; width: number; height: number }> {
  const optimized = await optimizeImageForWeb(bytes);
  const { width, height } = optimized;

  if (width < LOGO_MIN_DIMENSION || height < LOGO_MIN_DIMENSION) {
    throw new LogoRefusedError(
      `Logo must be at least ${LOGO_MIN_DIMENSION}×${LOGO_MIN_DIMENSION}px.`,
    );
  }
  const ratio = Math.max(width, height) / Math.min(width, height);
  if (ratio > 1.5) {
    throw new LogoRefusedError("Logo should be square (roughly equal width and height).");
  }

  const storagePath = `${folder}${optimizedStorageName(originalName)}`;
  const admin = supabaseAdmin();

  const { error: uploadError } = await admin.storage.from(BUCKET).upload(storagePath, optimized.buffer, {
    contentType: optimized.mimeType,
    cacheControl: "31536000",
    upsert: false,
  });
  if (uploadError) throw new Error(uploadError.message);

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(storagePath);
  return { url: pub.publicUrl, width, height };
}

export function savePartnerLogo(opts: {
  partnerId: string;
  bytes: Buffer;
  originalName?: string;
}): Promise<{ url: string; width: number; height: number }> {
  return saveLogoIn(partnerLogoFolder(opts.partnerId), opts.bytes, opts.originalName);
}

export function saveApplicantLogo(opts: {
  authUserId: string;
  bytes: Buffer;
  originalName?: string;
}): Promise<{ url: string; width: number; height: number }> {
  return saveLogoIn(applicantLogoFolder(opts.authUserId), opts.bytes, opts.originalName);
}

export async function removeApplicantLogos(authUserId: string): Promise<void> {
  const folder = applicantLogoFolder(authUserId);
  try {
    const bucket = supabaseAdmin().storage.from(BUCKET);
    const { data, error } = await bucket.list(folder.replace(/\/$/, ""), { limit: 100 });
    if (error) throw new Error(error.message);
    const paths = (data ?? []).map((f) => `${folder}${f.name}`);
    if (paths.length > 0) {
      const { error: removeError } = await bucket.remove(paths);
      if (removeError) throw new Error(removeError.message);
    }
  } catch (e) {
    console.error("[partner-upload] could not remove applicant logos:", (e as Error).message);
  }
}
