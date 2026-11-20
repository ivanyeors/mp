export const PAYOUT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const PAYOUT_IMAGE_ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp"] as const;

export function checkPayoutImage(file: { size: number; type: string }): string | null {
  if (!(PAYOUT_IMAGE_ALLOWED_MIME as readonly string[]).includes(file.type)) {
    return "Image must be a PNG, JPG, or WebP.";
  }
  if (file.size > PAYOUT_IMAGE_MAX_BYTES) {
    return `Image must be ${Math.round(PAYOUT_IMAGE_MAX_BYTES / (1024 * 1024))} MB or smaller.`;
  }
  return null;
}
