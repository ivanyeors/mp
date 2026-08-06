import { supabaseAdmin } from "@/lib/supabase/server";
import { optimizeImageForWeb, optimizedStorageName } from "@/lib/media-assets/optimize";
import {
  PAYOUT_IMAGE_MAX_BYTES,
  PAYOUT_IMAGE_ALLOWED_MIME,
  checkPayoutImage,
} from "./limits";

/**
 * Private payout images (PayNow QR + proof-of-payment), #81 / ADR 0015. Unlike
 * lib/config-upload + lib/partner-upload (public `media` bucket + getPublicUrl),
 * these live in a GENUINELY private bucket: service-role only, read exclusively
 * through short-lived signed URLs — nothing here ever returns a public URL.
 *
 * Ownership is enforced by the CALLER: object keys embed the owner partnerId
 * (`paynow-qr/{partnerId}/…`, `payout-proof/{partnerId}/…`), and callers only
 * ever load + sign keys for a partner they have already authorized (partner →
 * their own row, scoped by session; admin → any). The bucket having no public
 * policy means a leaked key is still useless without a fresh service-role signature.
 */
const BUCKET = "partner-private";

/** Signed-URL lifetime for private reads — short-lived per ADR 0015. */
export const SIGNED_URL_TTL_SECONDS = 900; // 15 min

/**
 * Longer lifetime for a proof-of-payment URL embedded in a payout EMAIL (#84).
 * The default 15 min is too short — a partner may open the mail hours/days later.
 * 7 days comfortably outlives that while the object stays private (still needs a
 * fresh service-role signature; the URL simply carries a longer-lived one).
 * Chosen over attaching image bytes, which would mean threading an attachments
 * field through all three transports + the Gmail MIME builder for one email.
 */
export const EMAIL_PROOF_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export { PAYOUT_IMAGE_MAX_BYTES, PAYOUT_IMAGE_ALLOWED_MIME, checkPayoutImage };

/** A refusal the caller should surface to the user (maps to HTTP 422). */
export class PayoutUploadRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayoutUploadRefusedError";
  }
}

/** Server-side format/size guard, mirroring checkPayoutImage. */
export function assertPayoutImageAllowed(fileSize: number, mimeType: string): void {
  const err = checkPayoutImage({ size: fileSize, type: mimeType });
  if (err) throw new PayoutUploadRefusedError(err);
}

/**
 * Optimize (re-encode to webp, strips EXIF) → upload under `{prefix}/…webp` in the
 * PRIVATE bucket → return the storage KEY (never a URL). `prefix` embeds the owner,
 * e.g. `paynow-qr/{partnerId}`. Caller persists the returned key.
 */
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

/**
 * Short-lived signed READ url for a private object, or null when the key is empty
 * or can't be signed. The CALLER must have already verified the requester owns
 * `path` (partner → own partnerId prefix; admin → any). Nothing public is exposed.
 */
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
