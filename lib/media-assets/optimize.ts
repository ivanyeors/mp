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
    // Fit inside a square so the shape is kept and whichever edge is long once
    // the photo is upright is capped. `metadata()` gives the size before
    // `.rotate()` turns it, so it can't say which edge that is.
    img = img.resize({ width: longEdgeCap, height: longEdgeCap, fit: "inside", withoutEnlargement: true });
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

export const EMAIL_RENDITION_WIDTH = 1200;
export const EMAIL_RENDITION_JPEG_QUALITY = 80;
/** What a rendition aims to stay under. A photo steps its quality down to reach it; a PNG is quantised. */
export const EMAIL_RENDITION_TARGET_BYTES = 300_000;

export type EmailRenditionImage = {
  buffer: Buffer;
  mimeType: "image/jpeg" | "image/png";
  extension: "jpg" | "png";
  width: number;
  height: number;
  byteSize: number;
  /** Some of it is see-through: kept as PNG, and shown on the email's light plate. */
  hasAlpha: boolean;
};

/**
 * An email rendition of a master (PRD-campaign-email-editor slice 05):
 * classic Outlook for Windows shows no WebP, so an email gets a JPEG, or a
 * PNG when the image has transparency, 1,200px wide at most (2x the 600px
 * column), aimed at under 300 KB. An alpha channel that is opaque everywhere
 * is a photo, and becomes a JPEG on white.
 */
export async function makeEmailRendition(input: Buffer): Promise<EmailRenditionImage> {
  const meta = await sharp(input, { failOn: "none" }).metadata();
  const hasAlpha = Boolean(meta.hasAlpha) && !(await sharp(input, { failOn: "none" }).stats()).isOpaque;
  const sized = () =>
    sharp(input, { failOn: "none" }).rotate().resize({ width: EMAIL_RENDITION_WIDTH, withoutEnlargement: true });

  let buffer: Buffer;
  if (hasAlpha) {
    buffer = await sized().png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
    if (buffer.byteLength > EMAIL_RENDITION_TARGET_BYTES) {
      buffer = await sized().png({ palette: true, quality: 90, compressionLevel: 9 }).toBuffer();
    }
  } else {
    buffer = Buffer.alloc(0);
    for (const quality of [EMAIL_RENDITION_JPEG_QUALITY, 70, 60]) {
      buffer = await sized().flatten({ background: "#ffffff" }).jpeg({ quality, mozjpeg: true }).toBuffer();
      if (buffer.byteLength <= EMAIL_RENDITION_TARGET_BYTES) break;
    }
  }
  const out = await sharp(buffer).metadata();
  return {
    buffer,
    mimeType: hasAlpha ? "image/png" : "image/jpeg",
    extension: hasAlpha ? "png" : "jpg",
    width: out.width ?? 0,
    height: out.height ?? 0,
    byteSize: buffer.byteLength,
    hasAlpha,
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
