// Client-safe limits + guideline text for partner LOGO uploads. Imports nothing
// server-only (no sharp / supabase), so the settings client can show the same
// guidance and pre-check without dragging the Node image pipeline into the
// browser bundle. Mirrors lib/config-upload/limits.ts. The real enforcement
// (incl. dimensions/squareness) lives server-side in ./index.ts.

export const LOGO_MAX_BYTES = 5 * 1024 * 1024; // 5 MB, pre-compression
export const LOGO_MIN_DIMENSION = 200; // px — min width AND height of the source
export const LOGO_ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp"] as const;

/** Guidelines shown at the upload control (also the server refusal wording). */
export const LOGO_GUIDELINES =
  "Square image, at least 200×200px. PNG, JPG, or WebP, up to 5 MB. " +
  "Shown on your public listing at /our-partners.";

/** Client pre-check (mirrored by the server). Returns an error message or null. */
export function checkLogoFile(file: { size: number; type: string }): string | null {
  if (!(LOGO_ALLOWED_MIME as readonly string[]).includes(file.type)) {
    return "Logo must be a PNG, JPG, or WebP image.";
  }
  if (file.size > LOGO_MAX_BYTES) {
    return `Logo must be ${Math.round(LOGO_MAX_BYTES / (1024 * 1024))} MB or smaller.`;
  }
  return null;
}
