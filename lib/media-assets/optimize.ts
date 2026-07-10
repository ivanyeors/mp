import sharp from "sharp";

export const IMAGE_LONG_EDGE_CAP = 2400;
export const IMAGE_WEBP_QUALITY = 80;

export type OptimizedImage = {
  buffer: Buffer;
  mimeType: "image/webp";
  extension: "webp";
  width: number;
  height: number;
  byteSize: number;
};

/**
 * Normalize raw image bytes to a WebP master for the Media Asset library.
 * Long edge capped; EXIF stripped (sharp default on encode).
 */
export async function optimizeImageForWeb(
  input: Buffer,
  opts?: { longEdgeCap?: number; quality?: number },
): Promise<OptimizedImage> {
  const longEdgeCap = opts?.longEdgeCap ?? IMAGE_LONG_EDGE_CAP;
  const quality = opts?.quality ?? IMAGE_WEBP_QUALITY;

  const pipeline = sharp(input, { failOn: "none" }).rotate(); // honour EXIF orientation then strip
  const meta = await pipeline.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const longEdge = Math.max(w, h);

  let img = sharp(input, { failOn: "none" }).rotate();
  if (longEdge > longEdgeCap && longEdge > 0) {
    img = img.resize({
      width: w >= h ? longEdgeCap : undefined,
      height: h > w ? longEdgeCap : undefined,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  const buffer = await img.webp({ quality, effort: 4 }).toBuffer();
  const out = await sharp(buffer).metadata();

  return {
    buffer,
    mimeType: "image/webp",
    extension: "webp",
    width: out.width ?? 0,
    height: out.height ?? 0,
    byteSize: buffer.byteLength,
  };
}

/** Storage object name for an optimized master. */
export function optimizedStorageName(originalName?: string): string {
  const stem = (originalName ?? "image")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .slice(0, 40) || "image";
  return `${stem}_${Date.now()}.webp`;
}
