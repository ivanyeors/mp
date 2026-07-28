import { supabaseAdmin } from "@/lib/supabase/server";
import { optimizeImageForWeb, optimizedStorageName } from "@/lib/media-assets/optimize";
import {
  LOGO_MAX_BYTES,
  LOGO_MIN_DIMENSION,
  LOGO_ALLOWED_MIME,
  LOGO_GUIDELINES,
} from "./limits";

const BUCKET = "media"; // public bucket — logos are shown on /our-partners

// Re-export client-safe limits so server callers can import from the module root.
export { LOGO_MAX_BYTES, LOGO_MIN_DIMENSION, LOGO_ALLOWED_MIME, LOGO_GUIDELINES };

/** A refusal the caller should surface to the user (maps to HTTP 422). */
export class LogoRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LogoRefusedError";
  }
}

/** Format + size guard (client mirrors this via checkLogoFile). */
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

/**
 * Optimize → upload under `media/partner-logos/{partnerId}/…webp` → return the
 * PUBLIC url. Unlike saveConfigUpload we insert no DB row: the caller writes the
 * url onto `partners.logo_url`. Dimension/squareness is enforced here (needs the
 * decoded image), mirroring the guideline text in {@link LOGO_GUIDELINES}.
 */
export async function savePartnerLogo(opts: {
  partnerId: string;
  bytes: Buffer;
  originalName?: string;
}): Promise<{ url: string; width: number; height: number }> {
  const optimized = await optimizeImageForWeb(opts.bytes);
  const { width, height } = optimized;

  if (width < LOGO_MIN_DIMENSION || height < LOGO_MIN_DIMENSION) {
    throw new LogoRefusedError(
      `Logo must be at least ${LOGO_MIN_DIMENSION}×${LOGO_MIN_DIMENSION}px.`,
    );
  }
  // Guide toward square: reject clearly non-square (ratio worse than 1.5:1).
  const ratio = Math.max(width, height) / Math.min(width, height);
  if (ratio > 1.5) {
    throw new LogoRefusedError("Logo should be square (roughly equal width and height).");
  }

  const storagePath = `partner-logos/${opts.partnerId}/${optimizedStorageName(opts.originalName)}`;
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
