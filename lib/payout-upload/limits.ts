// Client-safe limits for private payout images (PayNow QR + proof-of-payment).
// Imports nothing server-only (no sharp / supabase), so the settings client can
// pre-check without dragging the Node image pipeline into the browser bundle.
// Mirrors lib/config-upload/limits.ts + lib/partner-upload/limits.ts. Real
// enforcement lives server-side in ./index.ts.

export const PAYOUT_IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB, pre-compression
export const PAYOUT_IMAGE_ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp"] as const;

/** Client pre-check (mirrored by the server). Returns an error message or null. */
export function checkPayoutImage(file: { size: number; type: string }): string | null {
  if (!(PAYOUT_IMAGE_ALLOWED_MIME as readonly string[]).includes(file.type)) {
    return "Image must be a PNG, JPG, or WebP.";
  }
  if (file.size > PAYOUT_IMAGE_MAX_BYTES) {
    return `Image must be ${Math.round(PAYOUT_IMAGE_MAX_BYTES / (1024 * 1024))} MB or smaller.`;
  }
  return null;
}
