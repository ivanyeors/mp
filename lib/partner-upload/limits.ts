export const LOGO_MAX_BYTES = 5 * 1024 * 1024;
export const LOGO_MIN_DIMENSION = 200;
export const LOGO_ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp"] as const;

export const LOGO_GUIDELINES =
  "Square image, at least 200×200px. PNG, JPG, or WebP, up to 5 MB. " +
  "Shown on your public listing at /our-partners.";

export function checkLogoFile(file: { size: number; type: string }): string | null {
  if (!(LOGO_ALLOWED_MIME as readonly string[]).includes(file.type)) {
    return "Logo must be a PNG, JPG, or WebP image.";
  }
  if (file.size > LOGO_MAX_BYTES) {
    return `Logo must be ${Math.round(LOGO_MAX_BYTES / (1024 * 1024))} MB or smaller.`;
  }
  return null;
}
