/**
 * A Sizing photo is made smaller on the phone before it is uploaded (ADR 0047).
 * A phone's photo is several megabytes; as a data URL it grows by a third, and
 * a Vercel function refuses a request body over 4.5 MB, so the original often
 * could not be sent at all. Redrawing it also writes a plain JPEG (one Claude
 * can read, whatever the phone saved), drops the photo's metadata, including
 * where it was taken, and keeps Claude's check cheap. 2,000 px on the long side
 * is still plenty for the build team to size from.
 */

export const SIZING_PHOTO_MAX_EDGE = 2000;

/** Pure — `width`×`height` scaled down to fit `maxEdge` on its long side; never scaled up. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Browser-only — the photo as a JPEG data URL, at most `maxEdge` px on its long side, upright. */
export async function shrinkPhoto(
  file: Blob,
  { maxEdge = SIZING_PHOTO_MAX_EDGE, quality = 0.85 }: { maxEdge?: number; quality?: number } = {},
): Promise<string> {
  // Upright as the camera held it: the EXIF orientation is applied, then dropped with the rest.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser can't prepare the photo");
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    bitmap.close();
  }
}
