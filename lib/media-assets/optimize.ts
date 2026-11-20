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

export async function optimizeImageForWeb(
  input: Buffer,
  opts?: { longEdgeCap?: number; quality?: number },
): Promise<OptimizedImage> {
  const longEdgeCap = opts?.longEdgeCap ?? IMAGE_LONG_EDGE_CAP;
  const quality = opts?.quality ?? IMAGE_WEBP_QUALITY;

  const pipeline = sharp(input, { failOn: "none" }).rotate();
  const meta = await pipeline.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const longEdge = Math.max(w, h);

  let img = sharp(input, { failOn: "none" }).rotate();
  if (longEdge > longEdgeCap && longEdge > 0) {
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
export const EMAIL_RENDITION_TARGET_BYTES = 300_000;

export type EmailRenditionImage = {
  buffer: Buffer;
  mimeType: "image/jpeg" | "image/png";
  extension: "jpg" | "png";
  width: number;
  height: number;
  byteSize: number;
  hasAlpha: boolean;
};

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

export function optimizedStorageName(originalName?: string): string {
  const stem = (originalName ?? "image")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .slice(0, 40) || "image";
  return `${stem}_${Date.now()}.webp`;
}
